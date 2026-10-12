import { existsSync } from "node:fs";
import { basename } from "node:path";

/**
 * Backfill `process.env` with the user's real environment.
 *
 * GUI launches on macOS (Finder/Dock/Spotlight → `launchd`) and Linux (desktop
 * launchers) do NOT run a login shell, so the process never inherits the
 * variables a user exports in `~/.zshrc` / `~/.zprofile` / `~/.bash_profile` —
 * it sees only `launchd`'s minimal environment. Anything reading `process.env`
 * (API keys, `PATH`) is then wrong compared to a terminal launch, which is why
 * it "works in dev but not in the packaged app".
 *
 * We fix this the way VS Code does: spawn the user's login + interactive shell
 * once on POSIX systems and import whatever environment it prints.
 *
 * On Windows, GUI apps inherit environment from `explorer.exe`, but variables set
 * in `HKCU\Environment` or `HKLM\System\CurrentControlSet\Control\Session Manager\Environment`
 * (such as user-defined API keys or PATH additions) may not be fully present.
 * On Windows, we query the Windows registry via `reg query` to backfill missing
 * environment variables into `process.env`.
 *
 * Idempotent and best-effort — a failure just leaves the minimal env in place.
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

  try {
    const resolved =
      process.platform === "win32"
        ? _readWindowsRegistryEnv()
        : _readLoginShellEnv();
    if (!resolved) return;

    for (const [key, value] of Object.entries(resolved)) {
      if (_SKIP_KEYS.has(key)) continue;

      if (process.platform === "win32" && key.toUpperCase() === "PATH") {
        const currentPath =
          process.env[key] || process.env.PATH || process.env.Path || "";
        process.env[key] = currentPath
          ? _mergePathStrings(currentPath, value)
          : value;
      } else {
        process.env[key] = value;
      }
    }
  } catch (error) {
    console.error("Failed to resolve environment variables", error);
  }
}

/**
 * Reads user and system environment variables from the Windows Registry.
 */
function _readWindowsRegistryEnv(): Record<string, string> | null {
  const envs: Record<string, string> = {};

  // System environment variables
  const hklmResult = _queryRegKey(
    "HKLM\\System\\CurrentControlSet\\Control\\Session Manager\\Environment"
  );
  if (hklmResult) {
    Object.assign(envs, _parseRegOutput(hklmResult, process.env));
  }

  // User environment variables (override system)
  const hkcuResult = _queryRegKey("HKCU\\Environment");
  if (hkcuResult) {
    const hkcuParsed = _parseRegOutput(hkcuResult, {
      ...process.env,
      ...envs,
    });
    for (const [key, val] of Object.entries(hkcuParsed)) {
      if (key.toUpperCase() === "PATH" && envs[key]) {
        envs[key] = _mergePathStrings(envs[key], val);
      } else {
        envs[key] = val;
      }
    }
  }

  return Object.keys(envs).length > 0 ? envs : null;
}

/**
 * Query a registry key via `reg query`.
 */
function _queryRegKey(keyPath: string): string | null {
  try {
    const result = Bun.spawnSync(["reg", "query", keyPath], {
      stdout: "pipe",
      stderr: "ignore",
      timeout: 5000,
    });
    if (!result.success) return null;
    return Buffer.from(result.stdout).toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Parse output from `reg query`.
 */
export function _parseRegOutput(
  output: string,
  currentEnv: Record<string, string | undefined> = process.env
): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = output.split(/\r?\n/);

  for (const line of lines) {
    const match =
      /^\s+([^\s]+)\s+(REG_SZ|REG_EXPAND_SZ|REG_MULTI_SZ|REG_DWORD|REG_QWORD)\s*(.*)$/.exec(
        line
      );
    if (!match) continue;

    const [, key, type, rawValue] = match;
    let value = rawValue;

    if (type === "REG_EXPAND_SZ") {
      value = _expandWinEnvVars(rawValue, currentEnv, result);
    }

    result[key] = value;
  }

  return result;
}

/**
 * Expand Windows %VAR% references in strings.
 */
export function _expandWinEnvVars(
  str: string,
  env1: Record<string, string | undefined>,
  env2?: Record<string, string>
): string {
  return str.replace(/%([^%]+)%/g, (match, name) => {
    const val2 = env2 ? _getEnvCaseInsensitive(env2, name) : undefined;
    if (val2 !== undefined) return val2;

    const val1 = _getEnvCaseInsensitive(env1, name);
    if (val1 !== undefined) return val1;

    return match;
  });
}

/**
 * Case-insensitive environment key lookup helper.
 */
function _getEnvCaseInsensitive(
  env: Record<string, string | undefined>,
  key: string
): string | undefined {
  if (env[key] !== undefined) return env[key];
  const lowerKey = key.toLowerCase();
  for (const k of Object.keys(env)) {
    if (k.toLowerCase() === lowerKey) {
      return env[k];
    }
  }
  return undefined;
}

/**
 * Merges two semicolon-separated PATH strings, preserving order and avoiding duplicates.
 */
export function _mergePathStrings(
  existingPath: string,
  newPath: string
): string {
  const existingParts = existingPath.split(";").filter(Boolean);
  const newParts = newPath.split(";").filter(Boolean);

  const normalizedExisting = new Set(existingParts.map((p) => p.toLowerCase()));
  const merged = [...existingParts];

  for (const part of newParts) {
    if (!normalizedExisting.has(part.toLowerCase())) {
      merged.push(part);
      normalizedExisting.add(part.toLowerCase());
    }
  }

  return merged.join(";");
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
