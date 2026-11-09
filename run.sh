#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
python3 -m venv .venv 2>/dev/null || true
. .venv/bin/activate
pip install -r backend/requirements.txt
exec uvicorn backend.main:app --host 0.0.0.0 --port "${PORT:-8000}"
