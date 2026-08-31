#!/usr/bin/env python3
"""Create and verify the manifest-bound macOS payload used by the signing job."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import stat
import tarfile
from pathlib import Path, PurePosixPath
from typing import Any

ROOT = "DSH Desktop.app"
MAX_MEMBERS = 200_000
MAX_FILE_BYTES = 4 * 1024 * 1024 * 1024


class PayloadError(RuntimeError):
    """Report a payload that cannot cross the Apple-secret boundary."""


def sha256_file(path: Path) -> str:
    """Return the streaming SHA-256 digest for one regular file."""
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def clean_member_path(value: str) -> str:
    """Return one canonical archive path confined to the application root."""
    if "\\" in value:
        raise PayloadError(f"archive member uses a backslash: {value!r}")
    comparable = value[:-1] if value.endswith("/") else value
    path = PurePosixPath(comparable)
    if path.is_absolute() or not path.parts or path.parts[0] != ROOT:
        raise PayloadError(f"archive member is outside {ROOT}: {value!r}")
    if any(part in ("", ".", "..") for part in path.parts) or path.as_posix() != comparable:
        raise PayloadError(f"archive member is not normalized: {value!r}")
    return path.as_posix()


def resolve_link(member: str, target_value: str) -> str:
    """Validate a symlink target and return its root-confined resolved path."""
    if not target_value or "\\" in target_value:
        raise PayloadError(f"invalid symlink target: {member!r} -> {target_value!r}")
    target = PurePosixPath(target_value)
    if target.is_absolute():
        raise PayloadError(f"absolute symlink target: {member!r} -> {target_value!r}")
    parts = list(PurePosixPath(member).parent.parts)
    for part in target.parts:
        if part in ("", "."):
            continue
        if part == "..":
            if not parts:
                raise PayloadError(f"escaping symlink target: {member!r} -> {target_value!r}")
            parts.pop()
        else:
            parts.append(part)
    if not parts or parts[0] != ROOT:
        raise PayloadError(f"escaping symlink target: {member!r} -> {target_value!r}")
    return PurePosixPath(*parts).as_posix()


def archive_entries(archive: tarfile.TarFile) -> tuple[list[dict[str, Any]], list[tarfile.TarInfo]]:
    """Read the exact safe member graph and its content digests."""
    entries: list[dict[str, Any]] = []
    members: list[tarfile.TarInfo] = []
    seen: set[str] = set()
    total_size = 0
    for index, member in enumerate(archive.getmembers(), start=1):
        if index > MAX_MEMBERS:
            raise PayloadError("payload archive contains too many members")
        name = clean_member_path(member.name)
        if name in seen:
            raise PayloadError(f"duplicate archive member: {name}")
        seen.add(name)
        base: dict[str, Any] = {"path": name, "mode": format(member.mode & 0o7777, "04o")}
        if member.isdir():
            entry = {**base, "type": "directory"}
        elif member.isfile():
            source = archive.extractfile(member)
            if source is None:
                raise PayloadError(f"unreadable archive member: {name}")
            digest = hashlib.sha256()
            size = 0
            for chunk in iter(lambda: source.read(1024 * 1024), b""):
                size += len(chunk)
                total_size += len(chunk)
                if total_size > MAX_FILE_BYTES:
                    raise PayloadError("payload archive expands beyond the fixed size limit")
                digest.update(chunk)
            if size != member.size:
                raise PayloadError(f"archive member size mismatch: {name}")
            entry = {**base, "type": "file", "size": size, "sha256": digest.hexdigest()}
        elif member.issym():
            resolve_link(name, member.linkname)
            entry = {**base, "type": "symlink", "target": member.linkname}
        else:
            raise PayloadError(f"unsupported archive member type: {name}")
        entries.append(entry)
        members.append(member)

    entries.sort(key=lambda entry: entry["path"])
    types = {entry["path"]: entry["type"] for entry in entries}
    if types.get(ROOT) != "directory":
        raise PayloadError("archive root must be a directory")
    for entry in entries:
        parent = PurePosixPath(entry["path"]).parent
        while parent.as_posix() != ".":
            if types.get(parent.as_posix()) != "directory":
                raise PayloadError(f"archive parent is absent or not a directory: {entry['path']}")
            parent = parent.parent
    return entries, members


def create_manifest(archive_path: Path, manifest_path: Path, architecture: str, source_commit: str) -> None:
    """Write the canonical pre-sign manifest for an untrusted candidate archive."""
    with tarfile.open(archive_path, "r:gz") as archive:
        entries, _members = archive_entries(archive)
    document = {
        "schemaVersion": 1,
        "architecture": architecture,
        "sourceCommit": source_commit,
        "archive": archive_path.name,
        "archiveSha256": sha256_file(archive_path),
        "entries": entries,
    }
    with manifest_path.open("w", encoding="utf-8") as output:
        json.dump(document, output, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
        output.write("\n")


def read_manifest(manifest_path: Path, archive_path: Path, architecture: str, source_commit: str) -> list[dict[str, Any]]:
    """Parse and bind the exact manifest identity expected by the trusted job."""
    with manifest_path.open(encoding="utf-8") as source:
        manifest = json.load(source)
    fields = {"schemaVersion", "architecture", "sourceCommit", "archive", "archiveSha256", "entries"}
    if not isinstance(manifest, dict) or set(manifest) != fields:
        raise PayloadError("payload manifest has unexpected fields")
    if manifest["schemaVersion"] != 1 or manifest["architecture"] != architecture:
        raise PayloadError("payload manifest identity mismatch")
    if manifest["sourceCommit"] != source_commit or manifest["archive"] != archive_path.name:
        raise PayloadError("payload manifest source mismatch")
    if sha256_file(archive_path) != manifest["archiveSha256"]:
        raise PayloadError("payload archive digest mismatch")
    if not isinstance(manifest["entries"], list):
        raise PayloadError("payload manifest entries must be an array")
    return manifest["entries"]


def assert_artifact_members(artifact_dir: Path, archive_path: Path, manifest_path: Path) -> None:
    """Reject every file or filesystem type outside the two-file handoff."""
    expected_files = {archive_path.name, manifest_path.name}
    actual_files: set[str] = set()
    for child in artifact_dir.iterdir():
        mode = child.lstat().st_mode
        if not stat.S_ISREG(mode):
            raise PayloadError(f"unexpected non-file artifact member: {child.name}")
        actual_files.add(child.name)
    if actual_files != expected_files:
        raise PayloadError(f"unexpected artifact members: {sorted(actual_files ^ expected_files)}")


def safe_extract(archive: tarfile.TarFile, members: list[tarfile.TarInfo], entries: list[dict[str, Any]], output_path: Path) -> None:
    """Extract only verified directories, files, and confined symlinks without following links."""
    output_path.mkdir(mode=0o700)
    for entry in entries:
        if entry["type"] == "directory":
            output_path.joinpath(*PurePosixPath(entry["path"]).parts).mkdir(parents=True, exist_ok=True, mode=0o700)
    by_path = {clean_member_path(member.name): member for member in members}
    for entry in entries:
        destination = output_path.joinpath(*PurePosixPath(entry["path"]).parts)
        if entry["type"] == "file":
            source = archive.extractfile(by_path[entry["path"]])
            if source is None:
                raise PayloadError(f"unreadable archive member: {entry['path']}")
            flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW
            descriptor = os.open(destination, flags, 0o600)
            with os.fdopen(descriptor, "wb") as output:
                for chunk in iter(lambda: source.read(1024 * 1024), b""):
                    output.write(chunk)
            destination.chmod(int(entry["mode"], 8))
        elif entry["type"] == "symlink":
            resolve_link(entry["path"], entry["target"])
            os.symlink(entry["target"], destination)
    for entry in sorted(entries, key=lambda item: item["path"].count("/"), reverse=True):
        if entry["type"] == "directory":
            output_path.joinpath(*PurePosixPath(entry["path"]).parts).chmod(int(entry["mode"], 8))


def extracted_entries(output_path: Path) -> list[dict[str, Any]]:
    """Recompute the extracted tree without following candidate symlinks."""
    entries: list[dict[str, Any]] = []
    for directory, names, files in os.walk(output_path, topdown=True, followlinks=False):
        relative_directory = Path(directory).relative_to(output_path)
        for name in [*names, *files]:
            path = Path(directory, name)
            relative = PurePosixPath(*path.relative_to(output_path).parts).as_posix()
            status = path.lstat()
            base: dict[str, Any] = {"path": relative, "mode": format(stat.S_IMODE(status.st_mode), "04o")}
            if stat.S_ISLNK(status.st_mode):
                entry = {**base, "type": "symlink", "target": os.readlink(path)}
            elif stat.S_ISDIR(status.st_mode):
                entry = {**base, "type": "directory"}
            elif stat.S_ISREG(status.st_mode):
                entry = {**base, "type": "file", "size": status.st_size, "sha256": sha256_file(path)}
            else:
                raise PayloadError(f"unexpected extracted filesystem type: {relative}")
            entries.append(entry)
        if relative_directory.as_posix() == ".":
            continue
    return sorted(entries, key=lambda entry: entry["path"])


def verify_and_extract(
    artifact_dir: Path,
    archive_path: Path,
    manifest_path: Path,
    output_path: Path,
    architecture: str,
    source_commit: str,
) -> None:
    """Verify the two-file handoff and safely materialize its exact application tree."""
    assert_artifact_members(artifact_dir, archive_path, manifest_path)
    expected = read_manifest(manifest_path, archive_path, architecture, source_commit)
    with tarfile.open(archive_path, "r:gz") as archive:
        actual, members = archive_entries(archive)
        if actual != expected:
            raise PayloadError("payload archive differs from its manifest")
        safe_extract(archive, members, actual, output_path)
    if extracted_entries(output_path) != actual:
        raise PayloadError("extracted payload differs from its verified archive")


def parser() -> argparse.ArgumentParser:
    """Build the two-command signing payload CLI."""
    result = argparse.ArgumentParser()
    commands = result.add_subparsers(dest="command", required=True)
    create = commands.add_parser("create")
    create.add_argument("--archive", type=Path, required=True)
    create.add_argument("--manifest", type=Path, required=True)
    create.add_argument("--architecture", required=True)
    create.add_argument("--source-commit", required=True)
    verify = commands.add_parser("verify-extract")
    verify.add_argument("--artifact-dir", type=Path, required=True)
    verify.add_argument("--archive", type=Path, required=True)
    verify.add_argument("--manifest", type=Path, required=True)
    verify.add_argument("--output", type=Path, required=True)
    verify.add_argument("--architecture", required=True)
    verify.add_argument("--source-commit", required=True)
    return result


def main() -> None:
    """Run one manifest creation or trusted verification operation."""
    arguments = parser().parse_args()
    try:
        if arguments.command == "create":
            create_manifest(arguments.archive, arguments.manifest, arguments.architecture, arguments.source_commit)
        else:
            verify_and_extract(
                arguments.artifact_dir,
                arguments.archive,
                arguments.manifest,
                arguments.output,
                arguments.architecture,
                arguments.source_commit,
            )
    except (OSError, tarfile.TarError, json.JSONDecodeError, PayloadError) as error:
        raise SystemExit(str(error)) from error


if __name__ == "__main__":
    main()
