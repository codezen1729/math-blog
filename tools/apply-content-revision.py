"""Apply the audited full-content revision once, without overwriting newer writing."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import stat
import sys
import zipfile

REVISION = "full-main-tex-2026-09-03"
MARKER = "tools/content-revision-2026-09-03.json"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def checked_target(project, name):
    parts = PurePosixPath(name).parts
    for i in range(1, len(parts) + 1):
        part = project / Path(*parts[:i])
        require(not part.is_symlink(), "Symbolic-link targets are not permitted.")
        if i < len(parts):
            require(not part.exists() or part.is_dir(), f"A parent path is not a directory: {part.relative_to(project)}")
    target = project / name
    require(target.resolve().is_relative_to(project), "Path leaves the project.")
    return target


def apply_revision(project, archive):
    project = Path(project).resolve()
    marker = checked_target(project, MARKER)
    if marker.exists():
        require(not marker.is_symlink(), "The completion marker must be a regular file.")
        record = json.loads(marker.read_text())
        require(record.get("revision") == REVISION, "Unexpected completion marker.")
        print("The full-content revision is already present; subsequent writing is retained.")
        return 0

    with zipfile.ZipFile(archive) as package:
        archive_names = package.namelist()
        require(len(archive_names) == len(set(archive_names)), "Duplicate archive paths.")
        plan = json.loads(package.read("publication-plan.json"))
        require(plan.get("schema") == 1 and plan.get("revision") == REVISION, "Unexpected revision plan.")
        require(plan.get("totalPosts") == 83, "Unexpected post count.")
        entries = plan["files"]
        names = [item["path"] for item in entries]
        require(len(names) == len(set(names)), "Duplicate planned paths.")
        require(not any(str(parent) in names for name in names for parent in PurePosixPath(name).parents if str(parent) != "."), "Planned files cannot also be parent directories.")
        require(set(archive_names) == {"publication-plan.json", *names}, "Unlisted archive contents.")
        require(MARKER in names, "Completion marker is missing.")
        prepared = []
        for item in entries:
            name = item["path"]
            path = PurePosixPath(name)
            require(not path.is_absolute() and ".." not in path.parts and str(path) == name and "\\" not in name, "Unsafe archive path.")
            require(all(not part.startswith(".") for part in path.parts), "Hidden paths are not permitted.")
            require(path.parts[0] in {"tools", "styles", "figures"} or name == "README.md" or bool(re.fullmatch(r"\d{2}-[a-z0-9-]+\.tex", name)), "Path outside the approved source folders.")
            info = package.getinfo(name)
            require(not info.is_dir() and not stat.S_ISLNK(info.external_attr >> 16), "Archive entries must be regular files.")
            target = checked_target(project, name)
            before = item["beforeSha256"]
            if before is None:
                require(not target.exists(), f"Refusing to replace an existing new path: {name}")
            else:
                require(target.is_file() and digest(target.read_bytes()) == before, f"Writing changed since preparation: {name}")
            data = package.read(name)
            require(digest(data) == item["sha256"], f"Archive checksum failed: {name}")
            if name == MARKER:
                require(before is None and json.loads(data).get("revision") == REVISION, "Invalid completion marker.")
            prepared.append((target, data))

        # Do not change a single source until the entire revision passes preflight.
        prepared.sort(key=lambda item: item[0] == marker)
        for target, data in prepared:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        print(f"Applied the full-content revision to {len(prepared)} source files; completion was recorded last.")
        return len(prepared)


if __name__ == "__main__":
    project = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    archive = Path(sys.argv[2]) if len(sys.argv) > 2 else project / "content-revision.zip"
    apply_revision(project, archive)
