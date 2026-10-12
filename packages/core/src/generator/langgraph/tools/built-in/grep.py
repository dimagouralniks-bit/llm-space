import asyncio
import os

from langchain.tools import tool

# Common noise directories/files pruned from every search regardless of any
# .gitignore presence. Copied verbatim from the desktop TypeScript tool.
DEFAULT_IGNORES = [
    "node_modules",
    ".git",
    ".svn",
    ".hg",
    ".DS_Store",
    "Thumbs.db",
    ".cache",
    ".next",
    ".nuxt",
    ".turbo",
    ".parcel-cache",
    "dist",
    "build",
    "out",
    "coverage",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".venv",
    "venv",
]


@tool
async def grep(
    description: str,
    pattern: str,
    path: str,
    glob: str | None = None,
    case_insensitive: bool = False,
    context_lines: int = 0,
) -> str:
    """Search file contents with ripgrep.

    Search file contents with ripgrep. Supports regex patterns, glob filters,
    case-insensitive matching, and surrounding context lines. Common noise
    directories (node_modules, .git, build output, etc.) are excluded. Use to
    find symbols, usages, or text across the codebase. Prefer this over bash
    grep/rg for searching.

    Args:
        description: Must be the first parameter in the tool call. A short
            human-readable summary explaining what is being searched for.
        pattern: Regular expression pattern to search for in file contents.
        path: Absolute path to a file or directory to search in. A leading ~/
            is expanded to the current user's home directory.
        glob: Glob filter for files (e.g. "*.ts", "**/*.tsx") — maps to
            rg --glob.
        case_insensitive: Case insensitive search.
        context_lines: Number of context lines to show before and after each
            match (maps to rg -C). Defaults to 0.
    """
    path = os.path.expanduser(path)
    args = ["rg", "--line-number", "--with-filename", "--color=never"]
    # Prune common noise dirs/files regardless of any .gitignore presence.
    for name in DEFAULT_IGNORES:
        args += ["--glob", f"!{name}"]
    if case_insensitive:
        args.append("--ignore-case")
    if glob:
        args += ["--glob", glob]
    if context_lines is not None and context_lines > 0:
        args += ["--context", str(int(context_lines))]
    args += ["--regexp", pattern, "--", path]

    process = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout_bytes, stderr_bytes = await process.communicate()

    if process.returncode == 1:
        return "No matches found."
    if process.returncode != 0:
        stderr_str = stderr_bytes.decode("utf-8", errors="replace").strip()
        raise RuntimeError(
            stderr_str
            or f"grep failed with exit code {process.returncode}."
        )
    return stdout_bytes.decode("utf-8", errors="replace").rstrip()
