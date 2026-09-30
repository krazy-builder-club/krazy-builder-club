#!/usr/bin/env python3
"""Check relative Markdown file links in tracked documentation."""
from pathlib import Path
import re
import subprocess
from urllib.parse import unquote

root = Path(__file__).resolve().parents[1]
paths = subprocess.check_output(["git", "ls-files", "--cached", "--others", "--exclude-standard", "*.md"], cwd=root, text=True).splitlines()
errors = []
for name in sorted(set(paths)):
    path = root / name
    if not path.is_file():
        continue
    # Verbatim external evidence is archived with its original references.
    if name == "docs/sources/original-project-brief.md":
        continue
    content = re.sub(r"```.*?```", "", path.read_text(), flags=re.S)
    for target in re.findall(r"\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)", content):
        if re.match(r"[a-zA-Z][a-zA-Z0-9+.-]*:", target) or target.startswith("#"):
            continue
        file_part = unquote(target.split("#", 1)[0])
        if file_part and not (path.parent / file_part).exists():
            errors.append(f"{name}: missing {target}")
if errors:
    raise SystemExit("\n".join(errors))
print("Local Markdown file links passed (anchors and archived external references excluded).")
