#!/usr/bin/env python3
"""Build the deployable website archive reproducibly from the reviewed tree."""

from __future__ import annotations

import argparse
from io import BytesIO
import json
from pathlib import Path, PurePosixPath
import stat
import sys
import tempfile
import zipfile


ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "tools/site-package.json"
FIXED_TIME = (2020, 1, 1, 0, 0, 0)


def load_config(path: Path = CONFIG) -> dict:
    value = json.loads(path.read_text())
    if value.get("schema") != 1:
        raise ValueError("Unknown site-package schema")
    return value


def packaged_files(source: Path, config: dict) -> list[tuple[str, Path]]:
    excluded_directories = set(config["excludeDirectories"])
    excluded_names = set(config["excludeNames"])
    files: list[tuple[str, Path]] = []
    for path in source.rglob("*"):
        relative = path.relative_to(source)
        if any(part in excluded_directories for part in relative.parts):
            continue
        if path.name in excluded_names:
            continue
        if path.is_symlink():
            raise ValueError(f"Symbolic links are not permitted in the site package: {relative}")
        if not path.is_file():
            continue
        name = PurePosixPath(*relative.parts).as_posix()
        parsed = PurePosixPath(name)
        if parsed.is_absolute() or ".." in parsed.parts or str(parsed) != name:
            raise ValueError(f"Unsafe site package path: {name}")
        files.append((name, path))
    files.sort(key=lambda item: item[0].encode("utf-8"))
    if len({name for name, _ in files}) != len(files):
        raise ValueError("Duplicate site package paths")
    return files


def archive_bytes(source: Path, config: dict) -> bytes:
    stream = BytesIO()
    with zipfile.ZipFile(stream, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as package:
        for name, path in packaged_files(source, config):
            info = zipfile.ZipInfo(name, FIXED_TIME)
            info.create_system = 3
            info.external_attr = (stat.S_IFREG | 0o644) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            package.writestr(info, path.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    return stream.getvalue()


def package(root: Path = ROOT, *, check: bool = False) -> bool:
    config = load_config(root / "tools/site-package.json")
    source = (root / config["source"]).resolve()
    archive = (root / config["archive"]).resolve()
    if not source.is_dir() or not source.is_relative_to(root.resolve()):
        raise ValueError("The configured website source is unavailable or unsafe")
    for publication_check in (root / "tools/site-checks").glob("*.mjs"):
        local_check = source / "scripts" / publication_check.name
        if not local_check.is_file() or local_check.read_bytes() != publication_check.read_bytes():
            raise ValueError(f"Local and publication checks differ: {publication_check.name}")
    expected = archive_bytes(source, config)
    if check:
        if not archive.is_file() or archive.read_bytes() != expected:
            print("site-source.zip is stale; package the reviewed website before publication.", file=sys.stderr)
            return False
        print(f"Website package is current ({len(packaged_files(source, config))} files).")
        return True
    archive.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=archive.parent, prefix=f".{archive.name}.", delete=False) as handle:
        temporary = Path(handle.name)
        handle.write(expected)
        handle.flush()
    temporary.replace(archive)
    print(f"Packaged {len(packaged_files(source, config))} website files reproducibly.")
    return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    raise SystemExit(0 if package(check=args.check) else 1)
