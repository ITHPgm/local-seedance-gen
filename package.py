from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parent
OUT = ROOT.parent / "seedance-studio.zip"
EXCLUDE_PARTS = {"node_modules", ".venv", "__pycache__", ".gradle"}
EXCLUDE_NAMES = {".DS_Store"}
EXCLUDE_SUFFIXES = {".pyc"}

with ZipFile(OUT, "w", ZIP_DEFLATED) as archive:
    for path in sorted(ROOT.rglob("*")):
        if not path.is_file() or path.name in EXCLUDE_NAMES or path.suffix in EXCLUDE_SUFFIXES:
            continue
        relative = path.relative_to(ROOT)
        if any(part in EXCLUDE_PARTS for part in relative.parts):
            continue
        if relative.parts[:2] == ("backend", "media"):
            continue
        archive.write(path, Path(ROOT.name) / relative)

print(OUT)
