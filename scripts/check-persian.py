#!/usr/bin/env python3
"""Fail the build if a Persian zero-width character was written as a literal
backslash escape instead of the real character.

JSX text nodes and JSX attributes do NOT interpret `\\u200c`: it would be shown
to the user as the six printable characters `\\u200c` (e.g. "ستاره\\u200cها").
Keeping this check in prebuild/CI makes that regression impossible.
"""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
PATTERN = re.compile(r"\\u200[cdef]")
EXTENSIONS = {".ts", ".tsx", ".java"}
SKIP_DIRS = {"node_modules", "dist", "build", ".git", "assets"}

found = []
for path in ROOT.rglob("*"):
    if path.suffix not in EXTENSIONS:
        continue
    if any(part in SKIP_DIRS for part in path.parts):
        continue
    try:
        text = path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        continue
    for line_no, line in enumerate(text.splitlines(), 1):
        if PATTERN.search(line):
            found.append(f"{path.relative_to(ROOT)}:{line_no}: {line.strip()[:110]}")

if found:
    print("ERROR: literal Persian zero-width escape found (use the real character U+200C):", file=sys.stderr)
    for item in found:
        print("  " + item, file=sys.stderr)
    sys.exit(1)

print("Persian text check passed")
