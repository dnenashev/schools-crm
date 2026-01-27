#!/usr/bin/env python3
"""
Commit & push helper for Schools-crm.

What it does:
1) Normalizes line endings to LF for a curated list of files.
2) Removes trailing whitespace in those files.
3) Verifies `git diff --check` is clean.
4) Stages a curated list of files (safe for repo).
5) Creates a commit with a provided message.
6) Pushes to origin on the current branch.

Usage:
  python3 scripts/commit_and_push.py
  python3 scripts/commit_and_push.py -m "Your commit message"
  python3 scripts/commit_and_push.py --dry-run

Notes:
- It refuses to stage obvious secrets/data paths (e.g. .env, server/data/*.json).
- Run it from anywhere; it will cd to the repo root automatically.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path
from typing import Iterable


DEFAULT_MESSAGE = """Fix TypeScript build for Vercel

- Fix metric config typing and nullable fields
- Add Vite env typings and safe JSON parsing
- Add migration progress output
"""

# Keep this list explicit to avoid accidentally committing local data.
FILES_TO_STAGE = [
    "scripts/migrate-to-mongodb.js",
    "scripts/commit_and_push.py",
    "src/vite-env.d.ts",
    "src/types/school.ts",
    "src/components/Dashboard.tsx",
    "src/components/SchoolCard.tsx",
    "src/pages/SchoolsPage.tsx",
    "src/components/pipeline/FillDataMode.tsx",
    "src/components/pipeline/FunnelSelector.tsx",
    "src/components/pipeline/NumericMetricsDistribution.tsx",
    "src/components/pipeline/ResolveUnknownMode.tsx",
    "src/config/api.ts",
]

FORBIDDEN_PATH_PREFIXES = (
    ".env",
    "server/data/",
)


def run(cmd: list[str], *, check: bool = True, capture: bool = False) -> subprocess.CompletedProcess[str]:
    kwargs = {
        "text": True,
    }
    if capture:
        kwargs["stdout"] = subprocess.PIPE
        kwargs["stderr"] = subprocess.STDOUT
    p = subprocess.run(cmd, **kwargs)
    if check and p.returncode != 0:
        if capture and p.stdout:
            sys.stderr.write(p.stdout)
        raise SystemExit(p.returncode)
    return p


def repo_root() -> Path:
    p = run(["git", "rev-parse", "--show-toplevel"], capture=True)
    root = (p.stdout or "").strip()
    if not root:
        raise SystemExit("Not a git repository (git rev-parse failed).")
    return Path(root)


def is_forbidden_path(rel: str) -> bool:
    # Very conservative: block exact .env* and any server/data/ files.
    if rel.startswith(FORBIDDEN_PATH_PREFIXES):
        return True
    return False


def normalize_text_file(path: Path) -> bool:
    """
    Convert CRLF->LF and strip trailing whitespace.
    Returns True if file changed.
    """
    if not path.exists() or not path.is_file():
        return False

    raw = path.read_bytes()
    # CRLF -> LF
    raw2 = raw.replace(b"\r\n", b"\n")

    try:
        text = raw2.decode("utf-8")
    except UnicodeDecodeError:
        # Skip non-utf8/binary
        return False

    # Strip trailing spaces/tabs (preserve newline if present)
    lines = text.splitlines(True)
    cleaned_lines: list[str] = []
    for ln in lines:
        if ln.endswith("\n"):
            cleaned_lines.append(ln.rstrip(" \t\r\n") + "\n")
        else:
            cleaned_lines.append(ln.rstrip(" \t\r\n"))
    cleaned = "".join(cleaned_lines)

    if cleaned.encode("utf-8") != raw:
        path.write_text(cleaned, encoding="utf-8")
        return True
    return False


def normalize_files(files: Iterable[str]) -> list[str]:
    changed: list[str] = []
    for rel in files:
        p = Path(rel)
        if normalize_text_file(p):
            changed.append(rel)
    return changed


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("-m", "--message", default=DEFAULT_MESSAGE, help="Commit message")
    parser.add_argument("--dry-run", action="store_true", help="Do not commit/push, just show actions")
    args = parser.parse_args()

    root = repo_root()
    os.chdir(root)

    # Safety checks
    for f in FILES_TO_STAGE:
        if is_forbidden_path(f):
            raise SystemExit(f"Refusing to stage forbidden path: {f}")

    print(f"Repo: {root}")
    print("Normalizing line endings / whitespace…")
    changed = normalize_files(FILES_TO_STAGE)
    if changed:
        print("Normalized:", ", ".join(changed))
    else:
        print("No normalization changes needed.")

    print("Checking for whitespace errors (git diff --check)…")
    # If this prints anything, we abort (non-zero exit) so you can inspect.
    p = run(["git", "diff", "--check"], check=False, capture=True)
    if p.returncode != 0 or (p.stdout or "").strip():
        sys.stderr.write(p.stdout or "")
        print("\nFix the issues above, then re-run the script.", file=sys.stderr)
        return 2

    print("Staging files…")
    run(["git", "add", "--"] + FILES_TO_STAGE)

    # If nothing is staged, don't fail with "nothing to commit"
    staged_now = run(["git", "diff", "--name-only", "--cached"], capture=True).stdout.splitlines()
    if not staged_now:
        print("Nothing to commit (no staged changes).")
        return 0

    # Verify nothing forbidden got staged (defense in depth)
    forbidden = [f for f in staged_now if is_forbidden_path(f)]
    if forbidden:
        print("ERROR: forbidden files are staged:", file=sys.stderr)
        for f in forbidden:
            print(f" - {f}", file=sys.stderr)
        print("Aborting. Run: git reset HEAD -- <file>", file=sys.stderr)
        return 3

    if args.dry_run:
        print("DRY RUN: would commit and push now.")
        run(["git", "status"])
        return 0

    msg = args.message.strip()
    if not msg:
        print("Empty commit message. Use -m.", file=sys.stderr)
        return 4

    # Commit
    print("Committing…")
    run(["git", "commit", "-m", msg])

    # Push to current branch
    branch = run(["git", "rev-parse", "--abbrev-ref", "HEAD"], capture=True).stdout.strip()
    if not branch:
        print("Could not determine current branch.", file=sys.stderr)
        return 5

    print(f"Pushing to origin/{branch}…")
    run(["git", "push", "origin", branch])

    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

