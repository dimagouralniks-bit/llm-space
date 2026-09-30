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
 * Windows GUI apps inherit their environment from `explorer.exe`
 * (backed by the `HKCU\Environment` registry), so the shell-based approach is
 * neither needed nor applicable there. Instead, we read the registry directly.
 */

let _hydrated = false;

/** Shells whose `-ilc "… env …"` contract behaves like POSIX `sh`. */
const _POSIX_SHELLS = new Set(["zsh", "bash", "sh", "dash", "ksh"]);

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
    try {
      const resolved = _readWindowsUserEnv();
      if (!resolved) return;
      for (const [key, rawValue] of Object.entries(resolved)) {
        const upperKey = key.toUpperCase();

        // Use a case-insensitive check for SKIP_KEYS just in case, though mostly POSIX.
        let skip = false;
        for (const skipKey of _SKIP_KEYS) {
          if (skipKey.toUpperCase() === upperKey) {
            skip = true;
            break;
          }
        }
        if (skip) continue;

        // Expand any %VAR% patterns.
        const value = rawValue.replace(/%([^%]+)%/g, (_, k) => process.env[k] || "");

        if (upperKey === "PATH") {
          // Find if there's already an existing PATH key (Path vs PATH vs path)
          const envKey = Object.keys(process.env).find(k => k.toUpperCase() === "PATH") || "PATH";
          const existingPaths = (process.env[envKey] || "").split(";");
          const existingPathsLower = existingPaths.map(p => p.toLowerCase());
          const newPaths = value.split(";");

          for (const p of newPaths) {
            if (p && !existingPathsLower.includes(p.toLowerCase())) {
              existingPaths.push(p);
              existingPathsLower.push(p.toLowerCase());
            }
          }
          process.env[envKey] = existingPaths.join(";");
        } else {
          process.env[key] = value;
        }
      }
    } catch (error) {
      console.error("Failed to resolve Windows user environment", error);
    }
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

/**
 * Spawn the user's login + interactive shell and capture the environment it
 * prints. `-l` sources login profiles (`~/.zprofile`); `-i` additionally
 * sources the interactive rc (`~/.zshrc`), which is where most people actually
 * export their keys. The output is wrapped in a unique delimiter so
 * interactive-shell noise (session-restore banners, oh-my-zsh output) printed
 * before our command can be stripped.
 */
function _readLoginShellEnv(): Record<string, string> | null {
  const shell = _resolveShell();
  const delimiter = `__LLM_SPACE_ENV_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2)}__`;
  // `command env` bypasses any user alias/function shadowing `env`.
  const script = `echo ${delimiter}; command env; echo ${delimiter}`;

  const result = Bun.spawnSync([shell, "-ilc", script], {
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
 * Pick a POSIX shell to resolve with. Prefer the user's `$SHELL`; if it is a
 * non-POSIX shell (fish, nushell) whose `env` invocation differs, fall back to a
 * standard shell so the `-ilc "… env …"` contract still holds.
 */
function _resolveShell(): string {
  const shell = process.env.SHELL;
  if (shell && _POSIX_SHELLS.has(basename(shell))) {
    return shell;
  }
  // TODO: read the fish/nushell environment natively instead of falling back,
  // so variables exported *only* in their rc are still picked up.
  return existsSync("/bin/zsh") ? "/bin/zsh" : "/bin/bash";
}

/**
 * Read the current user's environment variables from the Windows registry.
 */
function _readWindowsUserEnv(): Record<string, string> | null {
  const result = Bun.spawnSync(["reg", "query", "HKCU\\Environment"], {
    stdout: "pipe",
    stderr: "ignore",
    timeout: 5000,
  });

  if (!result.success) return null;
  const output = Buffer.from(result.stdout).toString("utf8");

  const env: Record<string, string> = {};
  for (const line of output.split("\n")) {
    // Expected output format: "    VarName    REG_SZ    Value" or "    VarName    REG_EXPAND_SZ    Value"
    const match = /^\s*(.+?)\s+(REG_SZ|REG_EXPAND_SZ)\s+(.*)$/i.exec(line);
    if (match) {
      const key = match[1].trim();
      const value = match[3].trim();
      env[key] = value;
    }
  }

  return Object.keys(env).length > 0 ? env : null;
}

/**
 * Extract `KEY=VALUE` pairs from the shell's `env` output, taking only the text
 * between the two delimiter markers. Values may span multiple lines, so a line
 * that does not start a new `KEY=` is appended to the previous value.
 */
function _parseEnvBlock(
  output: string,
  delimiter: string
): Record<string, string> | null {
  const start = output.indexOf(delimiter);
  const end = output.lastIndexOf(delimiter);
  if (start === -1 || end === -1 || start === end) return null;

  const block = output.slice(start + delimiter.length, end);
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
