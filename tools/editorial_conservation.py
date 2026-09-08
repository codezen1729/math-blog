#!/usr/bin/env python3
"""Passage-by-passage conservation guard for the author's TeX manuscripts.

The one-time ``--freeze`` action inserts invisible BLOG-PASSAGE comments and
records the exact pre-edit passages. ``--review`` permits well-described,
pending edits for a local preview. ``--public`` accepts only passages that the
author has approved and a release approval bound to the exact source set.
"""

from __future__ import annotations

import argparse
from collections import Counter
from dataclasses import dataclass
from datetime import date
import difflib
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import unicodedata


ROOT = Path(__file__).resolve().parents[1]
BASELINE_PATH = ROOT / "tools/editorial-baseline.json"
LEDGER_PATH = ROOT / "tools/editorial-ledger.json"
BEGIN = "% BLOG-CONTENT-BEGIN"
END = "% BLOG-CONTENT-END"
MARKER = re.compile(r"(?m)^% BLOG-PASSAGE: ([a-z0-9-]+:(?:p|n)\d{4})\s*$")

SEMANTIC_ENVIRONMENTS = {
    "theorem", "thm", "lemma", "lem", "proposition", "prop", "corollary",
    "cor", "conjecture", "definition", "defn", "example", "proof", "prob",
    "task", "question", "question*", "numberedquestion", "remark",
    "numberedremark", "claim", "cl", "exercise", "observation", "tool", "thmx",
}
MATH_ENVIRONMENTS = {
    "equation", "equation*", "align", "align*", "alignat", "alignat*",
    "gather", "gather*", "multline", "multline*", "flalign", "flalign*",
    "eqnarray", "eqnarray*", "displaymath",
}
ATOMIC_ENVIRONMENTS = SEMANTIC_ENVIRONMENTS | MATH_ENVIRONMENTS | {
    "figure", "figure*", "table", "table*", "tikzpicture", "tikzcd",
    "enumerate", "itemize", "description", "inparaenum", "compactenum",
    "compactitem", "center", "flushleft", "flushright", "minipage",
    "multicols", "verbatim", "lstlisting", "comment",
}
ALLOWED_STATUSES = {
    "mechanically-corrected", "mathematically-corrected", "reframed-retained",
    "restored-from-author-material", "unresolved-visible", "new-bridge-prose",
    "approved-consolidation",
}
PROSE_ONLY_STATUSES = {
    "mechanically-corrected", "reframed-retained", "new-bridge-prose",
}


def sha256(value: str | bytes) -> str:
    if isinstance(value, str):
        value = value.encode("utf-8")
    return hashlib.sha256(value).hexdigest()


def stable_json(value) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def git_revision() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        return "unknown"


def load_manifest() -> list[dict]:
    return json.loads((ROOT / "tools/manifest.json").read_text())


def escaped(text: str, index: int) -> bool:
    count = 0
    index -= 1
    while index >= 0 and text[index] == "\\":
        count += 1
        index -= 1
    return bool(count % 2)


def mask_comments(text: str) -> str:
    """Replace comments by spaces without changing offsets or newlines."""
    output: list[str] = []
    for line in text.splitlines(keepends=True):
        cut = None
        for index, character in enumerate(line):
            if character == "%" and not escaped(line, index):
                cut = index
                break
        if cut is None:
            output.append(line)
            continue
        suffix = "\n" if line.endswith("\n") else ""
        visible_length = len(line) - len(suffix)
        output.append(line[:cut] + " " * (visible_length - cut) + suffix)
    return "".join(output)


def remove_markers(text: str) -> str:
    return re.sub(r"(?m)^% BLOG-PASSAGE: [a-z0-9-]+:(?:p|n)\d{4}[ \t]*\n?", "", text)


def document_parts(document: str, filename: str) -> tuple[str, str, str]:
    if document.count(BEGIN) != 1 or document.count(END) != 1:
        raise ValueError(f"{filename}: keep exactly one pair of blog-content markers")
    begin_index = document.index(BEGIN)
    begin_end = document.find("\n", begin_index)
    if begin_end < 0:
        raise ValueError(f"{filename}: content-begin marker needs its own line")
    body_start = begin_end + 1
    body_end = document.index(END, body_start)
    return document[:body_start], document[body_start:body_end], document[body_end:]


def logical_chunks(body: str) -> list[tuple[int, int]]:
    """Split at blank lines, but never through an atomic TeX environment."""
    masked = mask_comments(body)
    lines = body.splitlines(keepends=True)
    masked_lines = masked.splitlines(keepends=True)
    starts: list[int] = []
    offset = 0
    for line in lines:
        starts.append(offset)
        offset += len(line)

    stack: list[str] = []
    chunks: list[tuple[int, int]] = []
    chunk_start = 0
    token = re.compile(r"\\(?P<edge>begin|end)\{(?P<name>[^{}]+)\}")
    for number, (line, clean) in enumerate(zip(lines, masked_lines)):
        before = bool(stack)
        for match in token.finditer(clean):
            name = match.group("name")
            if name not in ATOMIC_ENVIRONMENTS:
                continue
            if match.group("edge") == "begin":
                stack.append(name)
            else:
                for index in range(len(stack) - 1, -1, -1):
                    if stack[index] == name:
                        del stack[index:]
                        break
        blank = not clean.strip()
        if blank and not before and not stack:
            stop = starts[number] + len(line)
            if stop > chunk_start:
                chunks.append((chunk_start, stop))
            chunk_start = stop
    if chunk_start < len(body):
        chunks.append((chunk_start, len(body)))
    return chunks


def hidden_substantive_text(source: str) -> bool:
    for line in source.splitlines():
        match = re.match(r"\s*%\s?(.*)", line)
        if not match:
            continue
        value = match.group(1).strip()
        if value.startswith("Source page"):
            value = re.sub(r"^Source page\s+\S+\s*", "", value)
        words = re.findall(r"[A-Za-z][A-Za-z'’-]*", value)
        if len(words) >= 8 and re.search(r"\$|\\\(|\\\[|\\begin\{", value):
            return True
    return False


def is_authored(source: str) -> bool:
    return bool(mask_comments(source).strip()) or hidden_substantive_text(source)


def insertion_points(body: str) -> list[int]:
    """Return starts of authored chunks, carrying leading page comments with them."""
    points: list[int] = []
    pending_start: int | None = None
    for start, stop in logical_chunks(body):
        chunk = body[start:stop]
        if pending_start is None:
            pending_start = start
        if is_authored(chunk):
            points.append(pending_start)
            pending_start = None
    return points


def insert_markers(body: str, slug: str) -> str:
    if MARKER.search(body):
        raise ValueError(f"{slug}: passage markers already exist")
    points = insertion_points(body)
    output = body
    for ordinal, point in reversed(list(enumerate(points, start=1))):
        output = output[:point] + f"% BLOG-PASSAGE: {slug}:p{ordinal:04d}\n" + output[point:]
    if remove_markers(output) != body:
        raise AssertionError(f"{slug}: inserting invisible markers changed authored content")
    return output


@dataclass(frozen=True)
class Passage:
    identifier: str
    file: str
    source: str
    line: int


def scan_passages(body: str, filename: str) -> tuple[list[Passage], list[str]]:
    matches = list(MARKER.finditer(body))
    passages: list[Passage] = []
    errors: list[str] = []
    if not matches:
        return [], [f"{filename}: no BLOG-PASSAGE markers"]
    if mask_comments(body[:matches[0].start()]).strip():
        errors.append(f"{filename}: substantive text appears before the first passage marker")
    for index, match in enumerate(matches):
        source_start = match.end()
        if source_start < len(body) and body[source_start] == "\n":
            source_start += 1
        source_end = matches[index + 1].start() if index + 1 < len(matches) else len(body)
        source = body[source_start:source_end]
        if not is_authored(source):
            errors.append(f"{filename}: {match.group(1)} contains no authored passage")
        passages.append(Passage(
            identifier=match.group(1), file=filename, source=source,
            line=body.count("\n", 0, match.start()) + 1,
        ))
    return passages, errors


def canonicalize_tex(source: str) -> str:
    """Ignore layout/comments, but not words, symbols, macros, or punctuation."""
    value = unicodedata.normalize("NFC", mask_comments(source))
    value = re.sub(r"[ \t\f\v]+", " ", value)
    value = re.sub(r" *\n+ *", "\n", value)
    return value.strip()


@dataclass(frozen=True)
class MathAtom:
    kind: str
    source: str


def math_atoms(source: str) -> list[MathAtom]:
    masked = mask_comments(source)
    names = "|".join(re.escape(name) for name in sorted(MATH_ENVIRONMENTS, key=len, reverse=True))
    pattern = re.compile(rf"\\begin\{{(?P<name>{names})\}}.*?\\end\{{(?P=name)\}}", re.S)
    found: list[tuple[int, int, str]] = [
        (match.start(), match.end(), match.group("name")) for match in pattern.finditer(masked)
    ]

    def occupied(index: int) -> bool:
        return any(start <= index < stop for start, stop, _ in found)

    for opening, closing, kind in ((r"\[", r"\]", "display"), (r"\(", r"\)", "inline")):
        cursor = 0
        while True:
            start = masked.find(opening, cursor)
            if start < 0:
                break
            stop = masked.find(closing, start + len(opening))
            if stop < 0:
                break
            stop += len(closing)
            if not occupied(start):
                found.append((start, stop, kind))
            cursor = stop

    cursor = 0
    while cursor < len(masked):
        if masked[cursor] != "$" or escaped(masked, cursor) or occupied(cursor):
            cursor += 1
            continue
        delimiter = "$$" if masked.startswith("$$", cursor) else "$"
        stop = cursor + len(delimiter)
        while True:
            stop = masked.find(delimiter, stop)
            if stop < 0:
                cursor += len(delimiter)
                break
            if not escaped(masked, stop):
                end = stop + len(delimiter)
                found.append((cursor, end, "display" if delimiter == "$$" else "inline"))
                cursor = end
                break
            stop += len(delimiter)

    return [MathAtom(kind, source[start:stop]) for start, stop, kind in sorted(found)]


def canonical_math(atom: MathAtom) -> str:
    value = atom.source
    if value.startswith("$$") and value.endswith("$$"):
        value = value[2:-2]
    elif value.startswith("$") and value.endswith("$"):
        value = value[1:-1]
    elif (value.startswith(r"\(") and value.endswith(r"\)")) or (value.startswith(r"\[") and value.endswith(r"\]")):
        value = value[2:-2]
    return re.sub(r"\s+", "", value)


def read_braced(text: str, start: int) -> tuple[str, int] | None:
    if start >= len(text) or text[start] != "{":
        return None
    depth = 1
    cursor = start + 1
    while cursor < len(text):
        if text[cursor] == "{" and not escaped(text, cursor):
            depth += 1
        elif text[cursor] == "}" and not escaped(text, cursor):
            depth -= 1
            if depth == 0:
                return text[start + 1:cursor], cursor + 1
        cursor += 1
    return None


def command_arguments(source: str, command: str, count: int = 1) -> list[list[str]]:
    masked = mask_comments(source)
    pattern = re.compile(rf"\\{re.escape(command)}(?![A-Za-z@])")
    output = []
    for match in pattern.finditer(masked):
        cursor = match.end()
        while cursor < len(masked) and masked[cursor].isspace():
            cursor += 1
        if command == "includegraphics" and cursor < len(masked) and masked[cursor] == "[":
            depth = 1
            cursor += 1
            while cursor < len(masked) and depth:
                if masked[cursor] == "[" and not escaped(masked, cursor):
                    depth += 1
                elif masked[cursor] == "]" and not escaped(masked, cursor):
                    depth -= 1
                cursor += 1
            while cursor < len(masked) and masked[cursor].isspace():
                cursor += 1
        arguments = []
        for _ in range(count):
            parsed = read_braced(masked, cursor)
            if not parsed:
                arguments = []
                break
            value, cursor = parsed
            arguments.append(re.sub(r"\s+", " ", value.strip()))
            while cursor < len(masked) and masked[cursor].isspace():
                cursor += 1
        if arguments:
            output.append(arguments)
    return output


def payload(source: str) -> dict:
    math = [{
        "kind": atom.kind, "source": atom.source,
        "canonicalSha256": sha256(canonical_math(atom)),
    } for atom in math_atoms(source)]
    clean = mask_comments(source)
    environments = Counter(re.findall(r"\\begin\{([^{}]+)\}", clean))
    citations = []
    for command in ("cite", "citet", "citep"):
        for arguments in command_arguments(source, command):
            citations.extend(value.strip() for value in arguments[0].split(",") if value.strip())
    return {
        "math": math,
        "semanticEnvironments": dict(sorted((name, environments[name]) for name in SEMANTIC_ENVIRONMENTS if environments[name])),
        "figures": [arguments[0] for arguments in command_arguments(source, "includegraphics")],
        "citations": sorted(citations),
        "labels": sorted(arguments[0] for arguments in command_arguments(source, "label")),
        "references": sorted(
            f"{command}:{arguments[0]}"
            for command in ("ref", "eqref", "ToolRef")
            for arguments in command_arguments(source, command)
        ),
        "postLinks": sorted("\0".join(arguments) for arguments in command_arguments(source, "BlogPost", 2)),
        "postLinksAt": sorted("\0".join(arguments) for arguments in command_arguments(source, "BlogPostAt", 3)),
        "footnotes": [
            {"source": arguments[0], "sha256": sha256(canonicalize_tex(arguments[0]))}
            for arguments in command_arguments(source, "footnote")
        ],
    }


def passage_kind(source: str) -> str:
    clean = mask_comments(source)
    if not clean.strip() and hidden_substantive_text(source):
        return "hidden-source"
    match = re.search(r"\\begin\{([^{}]+)\}", clean)
    if match and match.group(1) in SEMANTIC_ENVIRONMENTS:
        return match.group(1)
    if match and match.group(1) in {"figure", "figure*", "tikzpicture", "tikzcd"}:
        return "figure"
    if match and match.group(1) in {"enumerate", "itemize", "description", "inparaenum", "compactenum", "compactitem"}:
        return "list"
    if match and match.group(1) in MATH_ENVIRONMENTS:
        return "display-math"
    if re.search(r"\\(?:sub)*section\*?\s*\{", clean) or re.search(r"\\paragraph\*?\s*\{", clean):
        return "heading"
    return "prose"


def passage_record(passage: Passage, ordinal: int) -> dict:
    record = {
        "id": passage.identifier,
        "originalFile": passage.file,
        "originalOrdinal": ordinal,
        "originalStartLine": passage.line,
        "kind": passage_kind(passage.source),
        "source": passage.source,
        "rawSha256": sha256(passage.source),
        "canonicalSha256": sha256(canonicalize_tex(passage.source)),
    }
    record.update(payload(passage.source))
    return record


def source_set_digest(records: list[dict]) -> str:
    return sha256(stable_json(sorted((record["id"], record["canonicalSha256"]) for record in records)))


def freeze_baseline() -> None:
    if BASELINE_PATH.exists():
        raise FileExistsError(
            "The editorial baseline already exists. Never re-freeze after editing; remove it "
            "only when deliberately restarting from a separately verified source."
        )
    items = load_manifest()
    original_bodies: dict[str, str] = {}
    marked_documents: dict[str, str] = {}
    for item in items:
        path = ROOT / item["file"]
        document = path.read_text()
        prefix, body, suffix = document_parts(document, item["file"])
        original_bodies[item["file"]] = body
        marked_body = insert_markers(body, item["slug"])
        marked_documents[item["file"]] = prefix + marked_body + suffix
        if remove_markers(marked_body) != body:
            raise AssertionError(f"{item['file']}: marker round-trip failed")

    for filename, document in marked_documents.items():
        (ROOT / filename).write_text(document)

    posts = []
    all_records = []
    marker_ids: set[str] = set()
    for item in items:
        document = (ROOT / item["file"]).read_text()
        _, body, _ = document_parts(document, item["file"])
        passages, errors = scan_passages(body, item["file"])
        if errors:
            raise ValueError("\n".join(errors))
        records = []
        for ordinal, passage in enumerate(passages, start=1):
            if passage.identifier in marker_ids:
                raise ValueError(f"Duplicate passage marker: {passage.identifier}")
            marker_ids.add(passage.identifier)
            record = passage_record(passage, ordinal)
            records.append(record)
            all_records.append(record)
        posts.append({
            "slug": item["slug"], "file": item["file"], "title": item["title"],
            "bodyRawSha256BeforeMarkers": sha256(original_bodies[item["file"]]),
            "passageIds": [record["id"] for record in records], "passages": records,
        })

    baseline = {
        "schema": 2, "normalization": "tex-passages-v1",
        "purpose": "Exact pre-edit conservation baseline. Do not regenerate after editing.",
        "created": date.today().isoformat(), "baseCommit": git_revision(),
        "manifestSha256": sha256((ROOT / "tools/manifest.json").read_bytes()),
        "postCount": len(posts), "passageCount": len(all_records),
        "sourceSetSha256": source_set_digest(all_records), "posts": posts,
    }
    BASELINE_PATH.write_text(json.dumps(baseline, ensure_ascii=False, indent=2) + "\n")
    print(
        f"Frozen {len(posts)} manuscripts as {len(all_records)} stable passages at "
        f"{baseline['baseCommit']}. Marker removal reproduces every original body byte-for-byte."
    )


def baseline_records(baseline: dict) -> dict[str, dict]:
    return {passage["id"]: passage for post in baseline["posts"] for passage in post["passages"]}


def current_records() -> tuple[dict[str, dict], list[str]]:
    records: dict[str, dict] = {}
    errors: list[str] = []
    for item in load_manifest():
        filename = item["file"]
        _, body, _ = document_parts((ROOT / filename).read_text(), filename)
        passages, scan_errors = scan_passages(body, filename)
        errors.extend(scan_errors)
        for ordinal, passage in enumerate(passages, start=1):
            if passage.identifier in records:
                errors.append(f"Duplicate passage marker {passage.identifier} in {filename} and {records[passage.identifier]['currentFile']}")
                continue
            record = passage_record(passage, ordinal)
            record["currentFile"] = filename
            record["currentOrdinal"] = ordinal
            records[passage.identifier] = record
    return records, errors


def load_ledger() -> dict:
    if not LEDGER_PATH.exists():
        return {"schema": 2, "entries": [], "releaseApproval": None}
    ledger = json.loads(LEDGER_PATH.read_text())
    if ledger.get("schema") != 2:
        raise ValueError("tools/editorial-ledger.json must use schema 2")
    return ledger


def payload_hashes(record: dict, key: str) -> Counter:
    if key == "math":
        return Counter(entry["kind"] + "\0" + entry["canonicalSha256"] for entry in record[key])
    if key == "footnotes":
        return Counter(entry["sha256"] for entry in record[key])
    if key == "semanticEnvironments":
        return Counter(record[key])
    return Counter(record[key])


def changed_payloads(before: dict, after: dict) -> dict:
    changes = {}
    for key in ("math", "semanticEnvironments", "figures", "citations", "labels", "references", "postLinks", "postLinksAt", "footnotes"):
        old = payload_hashes(before, key)
        new = payload_hashes(after, key)
        removed, added = old - new, new - old
        if removed or added:
            changes[key] = {"removed": list(removed.elements()), "added": list(added.elements())}
    return changes


def readable_math_changes(before: dict, after: dict) -> dict:
    """Return exact readable TeX for the same canonical math delta kept in the ledger."""
    old_atoms, new_atoms = math_atoms(before["source"]), math_atoms(after["source"])
    old_keys = [atom.kind + "\0" + sha256(canonical_math(atom)) for atom in old_atoms]
    new_keys = [atom.kind + "\0" + sha256(canonical_math(atom)) for atom in new_atoms]
    old_sources = {key: f"{atom.kind}: {atom.source}" for key, atom in zip(old_keys, old_atoms)}
    new_sources = {key: f"{atom.kind}: {atom.source}" for key, atom in zip(new_keys, new_atoms)}
    removed, added = Counter(old_keys) - Counter(new_keys), Counter(new_keys) - Counter(old_keys)
    return {
        "removed": sorted(old_sources[key] for key in removed.elements()),
        "added": sorted(new_sources[key] for key in added.elements()),
    }


def mechanically_paired_footnotes(before: dict, after: dict) -> bool:
    """Recognise small prose edits without treating a whole footnote as deleted.

    Footnotes remain protected: their order, count, and every mathematical atom
    must be identical.  This exception only lets a mechanical ledger status
    account for a highly similar wording or punctuation correction.
    """
    old_notes = before.get("footnotes", [])
    new_notes = after.get("footnotes", [])
    if len(old_notes) != len(new_notes):
        return False
    for old_note, new_note in zip(old_notes, new_notes):
        old_math = [canonical_math(atom) for atom in math_atoms(old_note["source"])]
        new_math = [canonical_math(atom) for atom in math_atoms(new_note["source"])]
        if old_math != new_math:
            return False
        old_words = re.findall(r"[A-Za-z]+", old_note["source"].casefold())
        new_words = re.findall(r"[A-Za-z]+", new_note["source"].casefold())
        if difflib.SequenceMatcher(None, old_words, new_words, autojunk=False).ratio() < 0.80:
            return False
    return True


def ledger_digest(ledger: dict) -> str:
    return sha256(stable_json({key: value for key, value in ledger.items() if key != "releaseApproval"}))


def draft_ledger(reason: str) -> None:
    """Create pending, stale-proof entries for every changed/new passage."""
    baseline = json.loads(BASELINE_PATH.read_text())
    before_by_id = baseline_records(baseline)
    after_by_id, scan_errors = current_records()
    if scan_errors:
        raise ValueError("\n".join(scan_errors))
    ledger = load_ledger()
    existing = {entry["passageId"]: entry for entry in ledger.get("entries", [])}
    for identifier, after in after_by_id.items():
        before = before_by_id.get(identifier)
        if before and before["canonicalSha256"] == after["canonicalSha256"]:
            continue
        prior = existing.get(identifier)
        expected_before = before["canonicalSha256"] if before else None
        changes = changed_payloads(before, after) if before else {}
        if prior and prior.get("beforeSha256") == expected_before and prior.get("afterSha256") == after["canonicalSha256"]:
            if before and "math" in changes:
                prior["mathChangeSources"] = readable_math_changes(before, after)
            continue
        if before is None:
            status = "new-bridge-prose"
            if after["math"] or after["semanticEnvironments"]:
                raise ValueError(f"{identifier}: a new mathematical passage needs a hand-written ledger entry")
        elif before["kind"] == "hidden-source" and after["math"]:
            status = "restored-from-author-material"
        elif "math" in changes:
            status = "mathematically-corrected"
        elif set(changes).issubset({"postLinks", "postLinksAt"}):
            status = "reframed-retained"
        else:
            status = "mechanically-corrected"
        entry = {
            "passageId": identifier, "status": status,
            "beforeSha256": before["canonicalSha256"] if before else None,
            "afterSha256": after["canonicalSha256"], "reason": reason,
            "evidence": "Local conservation review; see the generated old/new passage diff.",
            "approval": {"state": "pending"},
        }
        if status == "restored-from-author-material":
            entry["provenance"] = {
                "kind": "same-author-commented-source", "baselinePassageId": identifier,
                "baselineSourceSha256": before["rawSha256"],
            }
        if "math" in changes:
            entry["mathChanges"] = changes["math"]
            entry["mathChangeSources"] = readable_math_changes(before, after)
        existing[identifier] = entry
    ledger["entries"] = sorted(existing.values(), key=lambda entry: entry["passageId"])
    ledger["releaseApproval"] = None
    LEDGER_PATH.write_text(json.dumps(ledger, ensure_ascii=False, indent=2) + "\n")
    print(f"Drafted {len(ledger['entries'])} pending passage-level ledger entries.")


def unified_diff(before: str, after: str, name: str) -> str:
    return "".join(difflib.unified_diff(
        before.splitlines(keepends=True), after.splitlines(keepends=True),
        fromfile=f"baseline/{name}", tofile=f"candidate/{name}", n=3,
    ))


def validate_entry(entry: dict, before: dict | None, after: dict, public: bool) -> list[str]:
    errors = []
    identifier = after["id"]
    if entry.get("status") not in ALLOWED_STATUSES:
        errors.append(f"{identifier}: invalid ledger status {entry.get('status')!r}")
    expected_before = before["canonicalSha256"] if before else None
    if entry.get("beforeSha256") != expected_before or entry.get("afterSha256") != after["canonicalSha256"]:
        errors.append(f"{identifier}: stale ledger hashes")
    if not str(entry.get("reason", "")).strip() or not str(entry.get("evidence", "")).strip():
        errors.append(f"{identifier}: ledger entry needs a reason and evidence")
    approval = entry.get("approval", {}).get("state")
    if approval not in {"pending", "approved"}:
        errors.append(f"{identifier}: approval state must be pending or approved")
    if public and approval != "approved":
        errors.append(f"{identifier}: pending editorial change has not been approved for publication")

    changes = changed_payloads(before, after) if before else {}
    paired_footnotes = bool(before and "footnotes" in changes and mechanically_paired_footnotes(before, after))
    status = entry.get("status")
    if status in PROSE_ONLY_STATUSES:
        additive_navigation = {"postLinks", "postLinksAt", "labels", "references"}
        forbidden = {
            key for key, change in changes.items()
            if (
                key not in additive_navigation
                and not (key == "footnotes" and paired_footnotes)
            ) or (key in additive_navigation and change["removed"])
        }
        if forbidden:
            errors.append(f"{identifier}: prose-only status changed protected payloads: {sorted(forbidden)}")
    if before:
        for key in ("figures", "citations", "labels", "references", "footnotes", "semanticEnvironments"):
            if key == "footnotes" and paired_footnotes:
                continue
            if key in changes and changes[key]["removed"]:
                errors.append(f"{identifier}: protected {key} were removed")
    if "math" in changes:
        if status not in {"mathematically-corrected", "restored-from-author-material", "approved-consolidation", "unresolved-visible"}:
            errors.append(f"{identifier}: mathematical change is misclassified as {status}")
        if entry.get("mathChanges") != changes["math"]:
            errors.append(f"{identifier}: ledger mathChanges do not match the exact before/after atoms")
        if entry.get("mathChangeSources") != readable_math_changes(before, after):
            errors.append(f"{identifier}: ledger mathChangeSources do not match the readable before/after atoms")
    elif entry.get("mathChanges"):
        errors.append(f"{identifier}: ledger claims a mathematical change that is not present")
    if status == "restored-from-author-material":
        provenance = entry.get("provenance")
        if not provenance:
            errors.append(f"{identifier}: restoration needs author-source provenance")
        elif before and (
            provenance.get("baselinePassageId") != identifier
            or provenance.get("baselineSourceSha256") != before["rawSha256"]
        ):
            errors.append(f"{identifier}: restoration provenance does not match the frozen author source")
    if status == "new-bridge-prose" and (after["math"] or after["semanticEnvironments"]):
        errors.append(f"{identifier}: new bridge prose may not contain mathematics or theorem environments")
    if status == "unresolved-visible" and not re.search(r"unresolved|incomplete|not yet|gap", mask_comments(after["source"]), re.I):
        errors.append(f"{identifier}: unresolved status requires an honest visible notice")
    return errors


def audit_project(mode: str = "review", report_json: Path | None = None, report_markdown: Path | None = None) -> dict:
    public = mode == "public"
    baseline = json.loads(BASELINE_PATH.read_text())
    if baseline.get("schema") != 2:
        raise ValueError("The editorial baseline must use schema 2")
    items = load_manifest()
    baseline_posts = {(post["slug"], post["file"]) for post in baseline["posts"]}
    current_posts = {(item["slug"], item["file"]) for item in items}
    errors, warnings = [], []
    if current_posts != baseline_posts:
        errors.append("The 84-post source set differs from the frozen conservation baseline")
    if len(items) != baseline.get("postCount"):
        errors.append(f"Expected {baseline.get('postCount')} posts; found {len(items)}")

    before_by_id = baseline_records(baseline)
    after_by_id, scan_errors = current_records()
    errors.extend(scan_errors)
    ledger = load_ledger()
    entries = ledger.get("entries", [])
    entries_by_id = {}
    for entry in entries:
        identifier = entry.get("passageId")
        if identifier in entries_by_id:
            errors.append(f"Duplicate ledger entry: {identifier}")
        entries_by_id[identifier] = entry

    for identifier in sorted(before_by_id.keys() - after_by_id.keys()):
        errors.append(f"Missing original passage: {identifier}")

    reviews = []
    for identifier, after in sorted(after_by_id.items()):
        before = before_by_id.get(identifier)
        changed = before is None or before["canonicalSha256"] != after["canonicalSha256"]
        moved = bool(before and before["originalFile"] != after["currentFile"])
        if changed:
            entry = entries_by_id.get(identifier)
            if not entry:
                errors.append(f"{identifier}: changed or new passage has no ledger entry")
                status = "unledgered"
            else:
                errors.extend(validate_entry(entry, before, after, public))
                status = entry.get("status")
        else:
            status = "moved-intact" if moved else "unchanged"
            if identifier in entries_by_id:
                warnings.append(f"{identifier}: stale ledger entry exists for an unchanged passage")
        reviews.append({
            "passageId": identifier, "status": status,
            "originalFile": before["originalFile"] if before else None,
            "currentFile": after["currentFile"],
            "originalOrdinal": before["originalOrdinal"] if before else None,
            "currentOrdinal": after["currentOrdinal"],
            "payloadChanges": changed_payloads(before, after) if before else {},
            "diff": unified_diff(before["source"] if before else "", after["source"], identifier) if changed else "",
        })

    for identifier in entries_by_id.keys() - after_by_id.keys():
        errors.append(f"Ledger entry refers to a missing passage: {identifier}")
    for identifier in after_by_id.keys() - before_by_id.keys():
        if not identifier.split(":")[-1].startswith("n"):
            errors.append(f"New passage {identifier} must use an nNNNN identifier")

    current_digest = source_set_digest(list(after_by_id.values()))
    if public:
        approval = ledger.get("releaseApproval")
        expected_ledger = ledger_digest(ledger)
        if not approval:
            errors.append("The candidate has no release approval bound to this exact source set")
        else:
            if approval.get("sourceSetSha256") != current_digest:
                errors.append("Release approval is stale: source-set hash differs")
            if approval.get("ledgerSha256") != expected_ledger:
                errors.append("Release approval is stale: ledger hash differs")
            if approval.get("state") != "approved" or not approval.get("approvedBy"):
                errors.append("Release approval must explicitly name the approving author")

    result = {
        "schema": 2, "mode": mode, "baselineCommit": baseline.get("baseCommit"),
        "currentCommit": git_revision(), "sourceSetSha256": current_digest,
        "postsChecked": len(items), "passagesChecked": len(after_by_id),
        "changedPassages": sum(review["status"] not in {"unchanged", "moved-intact"} for review in reviews),
        "pendingApprovals": sum(entry.get("approval", {}).get("state") != "approved" for entry in entries),
        "errors": errors, "warnings": warnings, "passages": reviews,
    }
    if report_json:
        report_json.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    if report_markdown:
        lines = [
            "# Editorial conservation report", "", f"- Mode: **{mode}**",
            f"- Baseline commit: `{baseline.get('baseCommit')}`", f"- Posts checked: **{len(items)}**",
            f"- Passages checked: **{len(after_by_id)}**", f"- Changed passages: **{result['changedPassages']}**",
            f"- Pending approvals: **{result['pendingApprovals']}**", "",
        ]
        if errors:
            lines.extend(["## Blocking problems", "", *[f"- {error}" for error in errors], ""])
        changed_reviews = [review for review in reviews if review["diff"]]
        if changed_reviews:
            lines.extend(["## Passage-level changes", ""])
            for review in changed_reviews:
                lines.extend([
                    f"### `{review['passageId']}` — {review['status']}", "",
                    f"`{review['originalFile']}` → `{review['currentFile']}`", "",
                    "```diff", review["diff"].rstrip(), "```", "",
                ])
        report_markdown.write_text("\n".join(lines).rstrip() + "\n")

    if errors:
        print("Editorial conservation check failed:", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
    else:
        note = "all changes are approved for release" if public else f"{result['pendingApprovals']} edited passage(s) await author approval"
        print(f"Editorial conservation check passed: {len(items)} posts, {len(after_by_id)} passages; {note}.")
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    actions = parser.add_mutually_exclusive_group(required=True)
    actions.add_argument("--freeze", action="store_true")
    actions.add_argument("--review", action="store_true")
    actions.add_argument("--public", action="store_true")
    actions.add_argument("--draft-ledger", action="store_true")
    parser.add_argument("--reason", default="Conservative local editorial pass; mathematical content is retained unless separately itemized.")
    parser.add_argument("--report-json", type=Path)
    parser.add_argument("--report-markdown", type=Path)
    arguments = parser.parse_args()
    if arguments.freeze:
        freeze_baseline()
        return 0
    if arguments.draft_ledger:
        draft_ledger(arguments.reason)
        return 0
    result = audit_project("public" if arguments.public else "review", arguments.report_json, arguments.report_markdown)
    return 0 if not result["errors"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
