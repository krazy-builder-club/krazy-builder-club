#!/usr/bin/env python3
"""Upload one key through stdin; never place its bytes in argv, logs, or state."""
import argparse
from pathlib import Path
import re
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--project", required=True)
parser.add_argument("--file", type=Path, required=True)
args = parser.parse_args()
keys = re.findall(r"sk-or-v1-[A-Za-z0-9_-]+", args.file.expanduser().read_text())
if len(keys) != 1:
    parser.error("Expected exactly one OpenRouter key in the input file")
subprocess.run(
    ["gcloud", "secrets", "versions", "add", "openrouter-api-key",
     "--project", args.project, "--data-file=-", "--quiet"],
    input=keys[0].encode(), check=True,
)
print("OpenRouter key uploaded; secret bytes were not printed.")
