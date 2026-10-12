import { existsSync } from "node:fs";
import { basename } from "node:path";

/**
 * Backfill `process.env` with the user's real login-shell environment.
 *
 * GUI launches on macOS (Finder/Dock/Spotlight → `launchd`) and Linux (desktop
 * launchers) do NOT run a login shell, so the process never inherits the
 * variables a user exports in `~/.zshrc` / `~/.zprofile` / `~/.bash_profile` —
 * it sees only `launchd`'s minimal environment. Anything reading `process.env`
 * (API keys, `PATH`) is then wrong compared to a terminal launch, which is why
 * it "works in dev but not in the packaged app".
 *
 * We fix this the way VS Code does: spawn the user's login + interactive shell
 * once and import whatever environment it prints.
 *
 * Idempotent and best-effort — a failure just leaves the minimal env in place.
 *
 * TODO(windows): Windows GUI apps inherit their environment from `explorer.exe`
 * (backed by the `HKCU\Environment` registry), so this shell-based approach is
 * neither needed nor applicable there. If a real gap ever surfaces on Windows,
 * handle it separately (e.g. read the registry) instead of spawning a shell.
 */

let _hydrated = false;

/** Shells whose `-ilc "… env …"` contract behaves like POSIX `sh`. */
const _POSIX_SHELLS = new Set(["zsh", "bash", "sh", "dash", "ksh"]);

/** Shells supported for login environment resolution. */
const _SUPPORTED_SHELLS = new Set([..._POSIX_SHELLS, "fish", "nu"]);

/**
 * Keys that describe the *resolver* shell rather than the user's environment,
 * or that we injected ourselves — never transplant these onto our process.
 */
const _SKIP_KEYS = new Set([
  "_",
  "SHLVL",
  "PWD",
  "OLDPWD",
  "TERM",
  "LLM_SPACE_RESOLVING_ENV",
]);

export function hydrateShellEnv(): void {
  if (_hydrated) return;
  _hydrated = true;

  if (process.platform === "win32") {
    // See TODO(windows) above.
    return;
  }

  try {
    const resolved = _readLoginShellEnv();
    if (!resolved) return;
    for (const [key, value] of Object.entries(resolved)) {
      if (_SKIP_KEYS.has(key)) continue;
      process.env[key] = value;
    }
  } catch (error) {
    console.error("Failed to resolve login shell environment", error);
  }
}

export type ShellSpawnSpec = {
  command: string;
  args: string[];
};

/**
 * Build spawn specification (command and CLI arguments) for reading
 * environment variables based on the target shell.
 */
export function _getShellSpawnSpec(
  shell: string,
  delimiter: string
): ShellSpawnSpec {
  const base = basename(shell);

  if (base === "nu") {
    // Nushell uses `-l` (login) and `-c` (commands).
    // `print` outputs to stdout, and `^env` invokes external `env` binary.
    return {
      command: shell,
      args: [
        "-l",
        "-c",
        `print "${delimiter}"; ^env; print "${delimiter}"`,
      ],
    };
  }

  // POSIX shells (zsh, bash, sh, dash, ksh) and fish shell
  return {
    command: shell,
    args: [
      "-ilc",
      `echo ${delimiter}; command env; echo ${delimiter}`,
    ],
  };
}

/**
 * Spawn the user's login + interactive shell and capture the environment it
 * prints. The output is wrapped in a unique delimiter so interactive-shell
 * noise (session-restore banners, oh-my-zsh output) printed before our command
 * can be stripped.
 */
function _readLoginShellEnv(): Record<string, string> | null {
  const shell = _resolveShell();
  const delimiter = `__LLM_SPACE_ENV_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2)}__`;

  const spec = _getShellSpawnSpec(shell, delimiter);

  const result = Bun.spawnSync([spec.command, ...spec.args], {
    env: {
      ...process.env,
      // Lets a user's rc detect this pass and skip interactive-only setup
      // (tmux autostart, prompts, animations).
      LLM_SPACE_RESOLVING_ENV: "1",
      // Discourage colors / pagers / interactive prompts from rc scripts.
      TERM: "dumb",
    },
    stdout: "pipe",
    stderr: "ignore",
    // Safety net: never let a slow rc hang app startup.
    timeout: 8000,
  });

  if (!result.success) return null;
  return _parseEnvBlock(Buffer.from(result.stdout).toString("utf8"), delimiter);
}

/**
 * Pick a shell to resolve with. Prefer the user's `$SHELL` if it is a supported
 * shell (POSIX shells, fish, nushell). Fall back to standard POSIX shell (`/bin/zsh`
 * or `/bin/bash`).
 */
export function _resolveShell(): string {
  const shell = process.env.SHELL;
  if (shell && _SUPPORTED_SHELLS.has(basename(shell))) {
    return shell;
  }
  return existsSync("/bin/zsh") ? "/bin/zsh" : "/bin/bash";
}

/**
 * Extract `KEY=VALUE` pairs from the shell's `env` output, taking only the text
 * between the two delimiter markers. Values may span multiple lines, so a line
 * that does not start a new `KEY=` is appended to the previous value.
 */
export function _parseEnvBlock(
  output: string,
  delimiter: string
): Record<string, string> | null {
  const start = output.indexOf(delimiter);
  const end = output.lastIndexOf(delimiter);
  if (start === -1 || end === -1 || start === end) return null;

  const block = output
    .slice(start + delimiter.length, end)
    .replace(/\r?\n$/, "");
  const env: Record<string, string> = {};
  let lastKey: string | null = null;

  for (const line of block.split("\n")) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (match) {
      lastKey = match[1];
      env[lastKey] = match[2];
    } else if (lastKey !== null) {
      env[lastKey] += `\n${line}`;
    }
  }
  return env;
}
