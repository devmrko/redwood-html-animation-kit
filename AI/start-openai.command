#!/bin/sh
cd -- "$(dirname -- "$0")/.." || exit 1
PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export PATH
if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 is required. Install Python 3, then open this file again."
  read -r answer
  exit 1
fi
exec python3 start.py --ai --port 0 --provider openai "$@"
