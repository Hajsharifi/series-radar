#!/usr/bin/env python3
"""Generate CHANGELOG.md from git tags and commits."""
import subprocess
from pathlib import Path

def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True, check=True).stdout.strip()

def main():
    tags = run(["git", "tag", "--sort=-v:refname"]).split("\n")
    tags = [t for t in tags if t]

    lines = [
        "# Changelog",
        "",
        "All notable changes to Series Radar are documented here.",
        "",
    ]

    for i, tag in enumerate(tags):
        try:
            date = run(["git", "log", "-1", "--format=%cs", tag])
        except subprocess.CalledProcessError:
            date = ""
        lines.append(f"## [{tag}] - {date}")
        lines.append("")

        next_tag = tags[i + 1] if i + 1 < len(tags) else None
        rev_range = f"{next_tag}..{tag}" if next_tag else tag
        commits = run(["git", "log", rev_range, "--pretty=format:- %s (%h)", "--no-merges"])
        lines.append(commits or "- No changes")
        lines.append("")

    Path("CHANGELOG.md").write_text("\n".join(lines), encoding="utf-8")
    print("✅ CHANGELOG.md generated")

if __name__ == "__main__":
    main()