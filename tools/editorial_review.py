#!/usr/bin/env python3
"""Generate deterministic editorial-review artifacts from the conservation corpus.

This is an audit aid, not a mathematical verifier.  In particular, proof maps
only classify explicit evidence in the TeX.  Silence is reported as
``unclassified`` rather than being treated as evidence of a missing proof.
"""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from dataclasses import dataclass
import difflib
import json
from pathlib import Path
import re
import sys

from editorial_conservation import (
    BASELINE_PATH,
    LEDGER_PATH,
    ROOT,
    baseline_records,
    canonical_math,
    command_arguments,
    current_records,
    load_ledger,
    load_manifest,
    mask_comments,
    MATH_ENVIRONMENTS,
    math_atoms,
    sha256,
    stable_json,
    unified_diff,
)


OUTPUT_DIR = ROOT / "tools/editorial-review"
REPORT_PATH = OUTPUT_DIR / "report.md"
LINK_GRAPH_PATH = OUTPUT_DIR / "internal-link-graph.json"
PROOF_MAPS_PATH = OUTPUT_DIR / "proof-integrity-maps.json"
VOICE_DRIFT_PATH = OUTPUT_DIR / "voice-drift.json"

TOKEN = re.compile(r"\\[A-Za-z@]+|[\w]+(?:['\N{RIGHT SINGLE QUOTATION MARK}-][\w]+)*|[^\s]", re.UNICODE)
THEOREM_KINDS = {
    "theorem", "thm", "lemma", "lem", "proposition", "prop", "corollary",
    "cor", "claim", "cl", "conjecture", "thmx",
}
PROOF_KINDS = {"proof"}
PROOF_HEADING = re.compile(
    r"\\(?:ProofHeading|ProofOf)\b|\\begin\{proof\}|"
    r"(?:^|\n)\s*(?:\\(?:textit|emph|textbf)\{)?Proof(?:\s+of\b|\.|:|\})",
    re.IGNORECASE,
)
POSTPONED = re.compile(
    r"\b(?:proof\s+(?:is\s+)?(?:deferred|postponed)|defer\s+the\s+proof|"
    r"prove(?:d)?\s+(?:this|it)\s+later|left\s+(?:to\s+the\s+reader|as\s+an\s+exercise)|"
    r"we\s+shall\s+(?:prove|return\s+to))\b",
    re.IGNORECASE,
)
EXPLICIT_GAP = re.compile(
    r"\b(?:missing\s+(?:argument|step|proof)|incomplete\s+(?:argument|proof)|"
    r"gap\s+in\s+the\s+(?:argument|proof)|does\s+not\s+establish|not\s+yet\s+established|"
    r"proof\s+is\s+in\s+(?:the\s+)?pictures|fill\s+in\s+the\s+gaps?)\b|"
    r"\\stackrel\s*\{\s*\?\s*\}",
    re.IGNORECASE,
)
CITATION_CUE = re.compile(
    r"\b(?:by|using|from|apply(?:ing)?|follows?\s+from|see|invoke|according\s+to)\b",
    re.IGNORECASE,
)
PLACEHOLDER_PATTERNS = (
    ("blocking", "editorial-marker", re.compile(r"\b(?:TODO|TBD|FIXME|XXX)\b")),
    ("blocking", "missing-step", EXPLICIT_GAP),
    ("review", "deferred-proof", POSTPONED),
    ("review", "normalization-gap", re.compile(r"\bafter\s+suitable\s+normalization\b", re.I)),
    ("review", "editorial-revisit", re.compile(r"\b(?:revisit|unclear)\b", re.I)),
    ("review", "remaining-argument", re.compile(r"\bremaining\s+argument\b", re.I)),
    ("review", "domain-qualification", re.compile(r"\bif\s+defined\b", re.I)),
    ("review", "cut-off", re.compile(r"\b(?:text|argument|proof)\s+(?:is\s+)?cut\s+off\b", re.I)),
)

SENSITIVE_SLUGS = {
    "classification-fatou-components": "Sullivan/no-wandering material",
    "surgical-tools": "general surgery tools",
    "first-surgery": "surgery construction",
    "second-surgery": "surgery construction",
    "third-surgery": "surgery construction",
    "attracting-and-repelling-fixed-points": "fixed-point and basin material",
    "parabolic-fixed-points-and-the-flower-theorem": "fixed-point and basin material",
    "critical-points-and-julia-set-connectivity": "critical points/connectivity",
    "quasiconformal-mappings": "quasiconformal mappings",
    "the-quadratic-family": "quadratic family",
    "shishikuras-surgery-principles": "surgery principles",
    "mcmullens-surgery": "McMullen surgery",
    "mcmullens-surgery-finite-symmetry": "McMullen surgery",
    "erdos-distance-problem": "Erdos distance problem",
    "the-language-of-category-theory-in-algebraic-topology": "category-theory passages",
}

BRITISH_AMERICAN_SPELLINGS = {
    "analyse": "analyze",
    "behaviour": "behavior",
    "centre": "center",
    "colour": "color",
    "fibre": "fiber",
    "labelled": "labeled",
    "modelling": "modeling",
    "neighbourhood": "neighborhood",
    "normalise": "normalize",
    "parametrise": "parametrize",
    "realise": "realize",
    "travelling": "traveling",
}
GENERIC_REPLACEMENT = re.compile(
    r"\b(?:in this (?:article|blog post)|we (?:delve into|explore the fascinating)|"
    r"it is important to note|in conclusion|this comprehensive guide|"
    r"let us embark on|the world of|a rich tapestry)\b",
    re.IGNORECASE,
)
PROSE_WORD = re.compile(r"[A-Za-z][A-Za-z'\N{RIGHT SINGLE QUOTATION MARK}-]*")
FIRST_PERSON = re.compile(r"\b(?:I|me|my|mine|we|us|our|ours)\b", re.IGNORECASE)


@dataclass(frozen=True)
class TokenChange:
    before: int
    after: int
    deleted: int
    inserted: int

    @property
    def ratio(self) -> float:
        denominator = self.before + self.after
        return (self.deleted + self.inserted) / denominator if denominator else 0.0

    def as_dict(self) -> dict:
        return {
            "before": self.before,
            "after": self.after,
            "deleted": self.deleted,
            "inserted": self.inserted,
            "ratio": round(self.ratio, 6),
        }


def token_change(before: str, after: str) -> TokenChange:
    """Return a symmetric changed-token ratio over visible TeX tokens."""
    old = TOKEN.findall(mask_comments(before))
    new = TOKEN.findall(mask_comments(after))
    deleted = inserted = 0
    for tag, old_start, old_end, new_start, new_end in difflib.SequenceMatcher(
        None, old, new, autojunk=False
    ).get_opcodes():
        if tag in {"delete", "replace"}:
            deleted += old_end - old_start
        if tag in {"insert", "replace"}:
            inserted += new_end - new_start
    return TokenChange(len(old), len(new), deleted, inserted)


def visible_prose(source: str) -> str:
    """Return conservative prose for voice checks, with mathematical payload masked.

    This is deliberately only a screening representation.  Equations and diagram
    source are replaced rather than interpreted, while linked prose and ordinary
    TeX formatting arguments remain visible.
    """
    value = mask_comments(source)
    names = "|".join(re.escape(name) for name in sorted(MATH_ENVIRONMENTS, key=len, reverse=True))
    value = re.sub(
        rf"\\begin\{{(?P<voice_math_name>{names})\}}.*?\\end\{{(?P=voice_math_name)\}}",
        " mathematics ", value, flags=re.DOTALL,
    )
    value = re.sub(
        r"\\begin\{(?P<voice_diagram_name>tikzpicture|tikzcd)\}.*?"
        r"\\end\{(?P=voice_diagram_name)\}",
        " diagram ", value, flags=re.DOTALL,
    )
    value = re.sub(r"\$\$.*?\$\$|\\\[.*?\\\]|\\\(.*?\\\)", " mathematics ", value, flags=re.DOTALL)
    value = re.sub(r"(?<!\\)\$.*?(?<!\\)\$", " mathematics ", value, flags=re.DOTALL)
    value = re.sub(r"\\BlogPostAt\{[^{}]*\}\{[^{}]*\}\{([^{}]*)\}", r" \1 ", value)
    value = re.sub(r"\\BlogPost\{[^{}]*\}\{([^{}]*)\}", r" \1 ", value)
    value = re.sub(r"\\href\{[^{}]*\}\{([^{}]*)\}", r" \1 ", value)
    value = re.sub(r"\\FigureTag\{[^{}]*\}\{[^{}]*\}", " ", value)
    value = re.sub(r"\\(?:url|label|ref|eqref|cite|citet|citep|FigureTag|FigureRef|ToolRef)\*?(?:\[[^\]]*\])?\{[^{}]*\}", " ", value)
    value = re.sub(r"\\(?:includegraphics|includepdf)\*?(?:\[[^\]]*\])?\{[^{}]*\}", " ", value)
    value = re.sub(r"\\(?:begin|end)\{[^{}]*\}", " ", value)
    value = re.sub(r"\\[A-Za-z@]+\*?(?:\[[^\]]*\])?", " ", value)
    value = value.replace(r"\\", "\n")
    value = re.sub(r"[{}~]", " ", value)
    value = value.replace("``", "\N{LEFT DOUBLE QUOTATION MARK}").replace("''", "\N{RIGHT DOUBLE QUOTATION MARK}")
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def prose_sentences(source: str) -> list[str]:
    """Extract substantial prose sentences for conservative drift screening."""
    prose = visible_prose(source)
    candidates = re.split(r"(?<=[.!?])(?:[\"'\N{RIGHT DOUBLE QUOTATION MARK}]*)\s+", prose)
    sentences = []
    for candidate in candidates:
        sentence = re.sub(r"\s+", " ", candidate).strip(" \t\n{}")
        words = PROSE_WORD.findall(sentence)
        placeholders = sum(word.casefold() in {"mathematics", "diagram"} for word in words)
        if len(words) >= 2 and placeholders / len(words) < 0.40:
            sentences.append(sentence)
    return sentences


def _sentence_key(sentence: str) -> str:
    return " ".join(word.casefold() for word in PROSE_WORD.findall(sentence) if word.casefold() != "mathematics")


def _sentence_similarity(before: str, after: str) -> float:
    old_key, new_key = _sentence_key(before), _sentence_key(after)
    if not old_key or not new_key:
        return 0.0
    if old_key == new_key:
        return 1.0
    old_words, new_words = set(old_key.split()), set(new_key.split())
    union = old_words | new_words
    overlap = len(old_words & new_words) / len(union) if union else 0.0
    containment = 0.0
    if min(len(old_words), len(new_words)) >= 4:
        containment = len(old_words & new_words) / min(len(old_words), len(new_words))
    sequence = difflib.SequenceMatcher(None, old_key, new_key, autojunk=False).ratio()
    return max(sequence, overlap, containment)


def sentence_drift(before: str, after: str) -> tuple[list[str], list[str]]:
    """Return only confidently deleted and newly introduced prose sentences.

    Minor punctuation, spelling and local grammar changes are greedily paired and
    therefore do not appear as deletion/replacement findings.
    """
    old, new = prose_sentences(before), prose_sentences(after)
    def windows(values: list[str]) -> list[str]:
        return [
            " ".join(values[start:start + width])
            for start in range(len(values))
            for width in range(1, min(3, len(values) - start) + 1)
        ]

    old_windows, new_windows = windows(old), windows(new)
    matched_old = {
        index for index, sentence in enumerate(old)
        if any(_sentence_similarity(sentence, candidate) >= 0.62 for candidate in new_windows)
    }
    matched_new = {
        index for index, sentence in enumerate(new)
        if any(_sentence_similarity(sentence, candidate) >= 0.62 for candidate in old_windows)
    }
    return (
        [sentence for index, sentence in enumerate(old) if index not in matched_old],
        [sentence for index, sentence in enumerate(new) if index not in matched_new],
    )


def _word_count(text: str, word: str) -> int:
    return len(re.findall(rf"\b{re.escape(word)}\b", text, re.IGNORECASE))


def build_voice_drift(manifest: list[dict], passage_reviews: list[dict]) -> dict:
    """Build a per-post authorial-voice conservation screen."""
    reviews_by_post: dict[str, list[dict]] = defaultdict(list)
    for review in passage_reviews:
        reviews_by_post[review["post"]].append(review)
    posts = []
    for item in manifest:
        reviews = sorted(
            reviews_by_post.get(item["slug"], []),
            key=lambda review: (review.get("currentOrdinal", 0), review["passageId"]),
        )
        deleted, introduced = [], []
        for review in reviews:
            removed_sentences, new_sentences = sentence_drift(review["before"], review["after"])
            deleted.extend({"passageId": review["passageId"], "text": value} for value in removed_sentences)
            introduced.extend({"passageId": review["passageId"], "text": value} for value in new_sentences)
        before_prose = "\n".join(visible_prose(review["before"]) for review in reviews)
        after_prose = "\n".join(visible_prose(review["after"]) for review in reviews)
        change = token_change(before_prose, after_prose)
        before_first = len(FIRST_PERSON.findall(before_prose))
        after_first = len(FIRST_PERSON.findall(after_prose))
        before_questions = sum(sentence.rstrip().endswith("?") for sentence in prose_sentences(before_prose))
        after_questions = sum(sentence.rstrip().endswith("?") for sentence in prose_sentences(after_prose))
        spelling = []
        for british, american in BRITISH_AMERICAN_SPELLINGS.items():
            british_removed = max(0, _word_count(before_prose, british) - _word_count(after_prose, british))
            american_added = max(0, _word_count(after_prose, american) - _word_count(before_prose, american))
            if british_removed and american_added:
                spelling.append({
                    "british": british,
                    "american": american,
                    "occurrences": min(british_removed, american_added),
                })
        generic = [finding for finding in introduced if GENERIC_REPLACEMENT.search(finding["text"])]
        post = {
            "slug": item["slug"],
            "title": item["title"],
            "file": item["file"],
            "changedProseRatio": round(change.ratio, 6),
            "deletedSentences": deleted,
            "newSentences": introduced,
            "firstPerson": {"before": before_first, "after": after_first, "delta": after_first - before_first},
            "rhetoricalQuestions": {
                "before": before_questions,
                "after": after_questions,
                "delta": after_questions - before_questions,
            },
            "britishToAmerican": spelling,
            "genericReplacementSentences": generic,
        }
        post["needsReview"] = bool(
            deleted or introduced or spelling or generic
            or post["firstPerson"]["delta"] < 0
            or post["rhetoricalQuestions"]["delta"] < 0
            or change.ratio > 0.10
        )
        posts.append(post)
    result = {
        "schema": 1,
        "auditOnly": True,
        "method": (
            "Equations and diagram source are masked. Sentences with at least two prose words are "
            "matched against one-to-three-sentence windows at similarity 0.62, so local punctuation, spelling, splitting, merging, and grammar edits are "
            "not misreported as deletion/replacement. Findings are review prompts, not authorship judgements."
        ),
        "posts": posts,
        "summary": {
            "posts": len(posts),
            "postsNeedingReview": sum(post["needsReview"] for post in posts),
            "deletedSentences": sum(len(post["deletedSentences"]) for post in posts),
            "newSentences": sum(len(post["newSentences"]) for post in posts),
            "britishToAmericanConversions": sum(
                entry["occurrences"] for post in posts for entry in post["britishToAmerican"]
            ),
            "genericReplacementSentences": sum(len(post["genericReplacementSentences"]) for post in posts),
        },
    }
    result["sha256"] = sha256(stable_json(result))
    return result


def _counter_delta(before: list[str], after: list[str]) -> dict:
    old, new = Counter(before), Counter(after)
    return {
        "removed": sorted((old - new).elements()),
        "added": sorted((new - old).elements()),
    }


def readable_payload_changes(before: dict, after: dict) -> dict:
    """Describe protected-payload changes using readable source, not only hashes."""
    changes: dict[str, dict] = {}
    old_atoms, new_atoms = math_atoms(before["source"]), math_atoms(after["source"])
    old_keys = [f"{atom.kind}\0{canonical_math(atom)}" for atom in old_atoms]
    new_keys = [f"{atom.kind}\0{canonical_math(atom)}" for atom in new_atoms]
    old_sources = {key: f"{atom.kind}: {atom.source}" for key, atom in zip(old_keys, old_atoms)}
    new_sources = {key: f"{atom.kind}: {atom.source}" for key, atom in zip(new_keys, new_atoms)}
    removed_math = Counter(old_keys) - Counter(new_keys)
    added_math = Counter(new_keys) - Counter(old_keys)
    math_delta = {
        "removed": sorted(old_sources[key] for key in removed_math.elements()),
        "added": sorted(new_sources[key] for key in added_math.elements()),
    }
    if any(math_delta.values()):
        changes["math"] = math_delta
    for key in (
        "figures", "citations", "labels", "references", "postLinks",
        "postLinksAt",
    ):
        delta = _counter_delta(list(before.get(key, [])), list(after.get(key, [])))
        if any(delta.values()):
            changes[key] = delta
    old_env = [f"{name} x{count}" for name, count in before.get("semanticEnvironments", {}).items()]
    new_env = [f"{name} x{count}" for name, count in after.get("semanticEnvironments", {}).items()]
    env_delta = _counter_delta(old_env, new_env)
    if any(env_delta.values()):
        changes["semanticEnvironments"] = env_delta
    old_notes = [entry["source"] for entry in before.get("footnotes", [])]
    new_notes = [entry["source"] for entry in after.get("footnotes", [])]
    note_delta = _counter_delta(old_notes, new_notes)
    if any(note_delta.values()):
        changes["footnotes"] = note_delta
    return changes


def _excerpt(text: str, start: int = 0, width: int = 220) -> str:
    visible = re.sub(r"\s+", " ", text[start:]).strip()
    if len(visible) <= width:
        return visible
    return visible[: width - 1].rstrip() + "\N{HORIZONTAL ELLIPSIS}"


def placeholder_findings(records: dict[str, dict], slug_by_file: dict[str, str]) -> list[dict]:
    findings = []
    for identifier, record in sorted(records.items()):
        source = record["source"]
        for line_offset, line in enumerate(source.splitlines()):
            stripped = line.lstrip()
            scope = "comment" if stripped.startswith("%") else "visible"
            if stripped.startswith("% BLOG-PASSAGE:"):
                continue
            for severity, category, pattern in PLACEHOLDER_PATTERNS:
                for match in pattern.finditer(line):
                    findings.append({
                        "post": slug_by_file.get(record["currentFile"], record["currentFile"]),
                        "file": record["currentFile"],
                        "passageId": identifier,
                        "line": record.get("originalStartLine", 1) + line_offset,
                        "scope": scope,
                        "severity": severity,
                        "category": category,
                        "phrase": match.group(0),
                        "excerpt": _excerpt(line, max(0, match.start() - 60)),
                    })
    return findings


def literal_formula_placeholders(records: dict[str, dict], slug_by_file: dict[str, str]) -> list[dict]:
    """Catch algebraic stand-ins, not ordinary discussion of lifting a map.

    This narrow publication blocker is separate from the broad review warnings:
    an intentional exercise or an explicitly acknowledged gap is not a literal
    formula placeholder merely because it mentions an unfinished proof.
    """
    findings = []
    pattern = re.compile(r"\banything\b|\(\s*lift\s*\)", re.I)
    for identifier, record in sorted(records.items()):
        cursor = 0
        for atom in math_atoms(record["source"]):
            start = record["source"].find(atom.source, cursor)
            cursor = start + len(atom.source)
            for match in pattern.finditer(mask_comments(atom.source)):
                findings.append({
                    "post": slug_by_file.get(record["currentFile"], record["currentFile"]),
                    "file": record["currentFile"], "passageId": identifier,
                    "line": record.get("originalStartLine", 1) + record["source"][:start + match.start()].count("\n"),
                    "scope": "visible", "severity": "blocking", "category": "literal-formula-placeholder",
                    "phrase": match.group(0), "excerpt": _excerpt(atom.source),
                })
    return findings


def _split_link(value: str, expected: int) -> list[str]:
    parts = value.split("\0")
    return (parts + [""] * expected)[:expected]


def _labels_by_slug(records: dict[str, dict], slug_by_file: dict[str, str]) -> dict[str, set[str]]:
    labels: dict[str, set[str]] = defaultdict(set)
    for record in records.values():
        slug = slug_by_file.get(record["currentFile"])
        if not slug:
            continue
        labels[slug].update(record.get("labels", []))
        for args in command_arguments(record["source"], "FigureTag", 2):
            labels[slug].add(args[1])
        for args in command_arguments(record["source"], "begin", 2):
            if args[0] == "tool":
                labels[slug].add(f"tool:{args[1]}")
    return labels


def build_link_graph(manifest: list[dict], records: dict[str, dict]) -> dict:
    order = {item["slug"]: index for index, item in enumerate(manifest, start=1)}
    slug_by_file = {item["file"]: item["slug"] for item in manifest}
    labels = _labels_by_slug(records, slug_by_file)
    nodes = [{
        "slug": item["slug"], "title": item["title"], "file": item["file"],
        "collection": item.get("collection"), "phase": item.get("phase"),
        "order": order[item["slug"]], "labels": sorted(labels[item["slug"]]),
    } for item in manifest]
    edges = []
    occurrence: Counter[tuple] = Counter()
    for identifier, record in sorted(records.items(), key=lambda pair: (
        order.get(slug_by_file.get(pair[1]["currentFile"], ""), 10**9),
        pair[1].get("currentOrdinal", 0), pair[0],
    )):
        source_slug = slug_by_file.get(record["currentFile"])
        if not source_slug:
            continue
        raw_links = []
        for value in record.get("postLinks", []):
            target, text = _split_link(value, 2)
            raw_links.append(("post", target, text, None))
        for value in record.get("postLinksAt", []):
            target, label, text = _split_link(value, 3)
            raw_links.append(("exact", target, text, label))
        for link_type, target, text, label in raw_links:
            key = (source_slug, target, label, text)
            occurrence[key] += 1
            target_exists = target in order
            label_exists = None if link_type == "post" else target_exists and label in labels[target]
            direction = "unknown"
            if target_exists:
                difference = order[target] - order[source_slug]
                direction = "same" if difference == 0 else "forward" if difference > 0 else "backward"
            edge = {
                "id": "link-" + sha256(stable_json([identifier, link_type, target, label, text, occurrence[key]]))[:16],
                "sourceSlug": source_slug,
                "sourceFile": record["currentFile"],
                "sourcePassageId": identifier,
                "sourceOrdinal": record.get("currentOrdinal"),
                "type": link_type,
                "linkedText": text,
                "targetSlug": target,
                "targetLabel": label,
                "targetExists": target_exists,
                "labelExists": label_exists,
                "selfLink": target == source_slug,
                "direction": direction,
                "occurrence": occurrence[key],
            }
            edges.append(edge)
    degree = Counter()
    for edge in edges:
        if edge["targetExists"]:
            degree[edge["sourceSlug"]] += 1
            degree[edge["targetSlug"]] += 1
    repeated = [edge for edge in edges if edge["occurrence"] > 1]
    graph = {
        "schema": 1,
        "auditOnly": True,
        "method": "Explicit BlogPost and BlogPostAt calls only; forward links are review hints, not errors.",
        "nodes": nodes,
        "edges": edges,
        "diagnostics": {
            "brokenTargets": [edge["id"] for edge in edges if not edge["targetExists"]],
            "brokenLabels": [edge["id"] for edge in edges if edge["labelExists"] is False],
            "selfLinks": [edge["id"] for edge in edges if edge["selfLink"]],
            "repeatedEdges": [edge["id"] for edge in repeated],
            "isolatedPosts": [item["slug"] for item in manifest if not degree[item["slug"]]],
            "forwardLinks": [edge["id"] for edge in edges if edge["direction"] == "forward"],
        },
    }
    graph["sha256"] = sha256(stable_json(graph))
    return graph


def _theorem_title(source: str) -> str | None:
    clean = mask_comments(source)
    heading = re.search(r"\\(?:sub)*section\*?\s*\{((?:Theorem|Lemma|Proposition|Corollary|Claim|Conjecture)\b[^{}]*)\}", clean, re.I)
    if heading:
        return re.sub(r"\s+", " ", heading.group(1)).strip()
    match = re.search(
        r"\\begin\{(?:theorem|thm|lemma|lem|proposition|prop|corollary|cor|claim|cl|conjecture|thmx)\}"
        r"\s*\[([^\]]+)\]",
        clean,
    )
    return re.sub(r"\s+", " ", match.group(1)).strip() if match else None


def _explicit_references(source: str) -> list[dict]:
    refs = []
    for command in ("ref", "eqref", "ToolRef"):
        for args in command_arguments(source, command):
            refs.append({"type": command, "target": args[0], "classification": "cited"})
    for command in ("cite", "citet", "citep"):
        for args in command_arguments(source, command):
            for target in args[0].split(","):
                refs.append({"type": command, "target": target.strip(), "classification": "cited"})
    for args in command_arguments(source, "BlogPost", 2):
        refs.append({"type": "BlogPost", "target": args[0], "linkedText": args[1], "classification": "cited"})
    for args in command_arguments(source, "BlogPostAt", 3):
        refs.append({"type": "BlogPostAt", "target": args[0], "targetLabel": args[1], "linkedText": args[2], "classification": "cited"})
    return refs


def _proof_disposition(statement: dict, following: list[dict]) -> tuple[str, str, list[dict]]:
    window = [statement] + following[:2]
    combined = "\n".join(record["source"] for record in window)
    clean = mask_comments(combined)
    refs = _explicit_references(combined)
    if EXPLICIT_GAP.search(combined):
        return "genuinely-missing", "explicit gap wording", refs
    if POSTPONED.search(clean):
        return "postponed", "explicit postponement wording", refs
    if PROOF_HEADING.search(clean) or any(record.get("kind") in PROOF_KINDS for record in following[:2]):
        return "proof-present", "explicit proof text is present; correctness has not been certified", refs
    if refs and CITATION_CUE.search(clean):
        return "cited", "explicit reference with a citation cue", refs
    return "unclassified", "no conservative automatic classification", refs


STATEMENT_START = re.compile(
    r"\\begin\{(?P<environment>theorem|thm|lemma|lem|proposition|prop|corollary|cor|claim|cl|conjecture|thmx)\*?\}|"
    r"\\(?:sub)*section\*?\s*\{(?P<heading>Theorem|Lemma|Proposition|Corollary|Claim|Conjecture)\b[^{}]*\}",
    re.I,
)


def _audit_statement_slices(record: dict) -> list[dict]:
    """Inventory legacy headings and multiple statements without editing source passages."""
    source = record["source"]
    starts = list(STATEMENT_START.finditer(mask_comments(source)))
    if not starts:
        return [record]
    output = []
    if starts[0].start():
        output.append({**record, "source": source[:starts[0].start()], "kind": "prose", "auditOffset": 0})
    for index, match in enumerate(starts):
        end = starts[index + 1].start() if index + 1 < len(starts) else len(source)
        excerpt = source[match.start():end]
        output.append({**record, "source": excerpt, "kind": (match.group("environment") or match.group("heading")).lower(),
                       "auditOffset": match.start(), "labels": [args[0] for args in command_arguments(excerpt, "label")]})
    return output


def build_proof_maps(
    manifest: list[dict], records: dict[str, dict], findings: list[dict]
) -> dict:
    slug_by_file = {item["file"]: item["slug"] for item in manifest}
    reasons = dict(SENSITIVE_SLUGS)
    for item in manifest:
        if item["slug"].startswith("lemma-book-"):
            reasons[item["slug"]] = "Olympiad argument screening"
    records_by_slug: dict[str, list[dict]] = defaultdict(list)
    for record in records.values():
        slug = slug_by_file.get(record["currentFile"])
        if slug in reasons:
            records_by_slug[slug].extend(_audit_statement_slices(record))
    for values in records_by_slug.values():
        values.sort(key=lambda record: (record.get("currentOrdinal", 0), record["id"], record.get("auditOffset", 0)))
    findings_by_slug: dict[str, list[dict]] = defaultdict(list)
    for finding in findings:
        findings_by_slug[finding["post"]].append(finding)

    posts = []
    for item in manifest:
        slug = item["slug"]
        if slug not in reasons:
            continue
        values = records_by_slug.get(slug, [])
        theorems = []
        proof_passage_ids = set()
        for index, record in enumerate(values):
            if record.get("kind") not in THEOREM_KINDS:
                continue
            following = []
            for candidate in values[index + 1:]:
                if candidate.get("kind") in THEOREM_KINDS:
                    break
                following.append(candidate)
                if len(following) == 2:
                    break
            status, evidence, refs = _proof_disposition(record, following)
            proof_candidates = [record] + following
            if status == "proof-present":
                proof_passage_ids.update(candidate["id"] for candidate in proof_candidates if candidate.get("kind") == "proof" or PROOF_HEADING.search(mask_comments(candidate["source"])))
            conclusion = _excerpt(mask_comments(record["source"]))
            theorem_id = "theorem-" + sha256(record["id"] + conclusion)[:16]
            theorems.append({
                "id": theorem_id,
                "environment": record.get("kind"),
                "title": _theorem_title(record["source"]),
                "passageId": record["id"],
                "line": record.get("originalStartLine"),
                "labels": record.get("labels", []),
                "statementExcerpt": conclusion,
                "sourceSlice": record["source"],
                "sourceSliceSha256": sha256(record["source"]),
                "offsetWithinPassage": record.get("auditOffset", 0),
                "proofEvidencePassages": list(dict.fromkeys(candidate["id"] for candidate in proof_candidates if candidate.get("kind") == "proof" or PROOF_HEADING.search(mask_comments(candidate["source"])))),
                "hypotheses": [],
                "intermediateClaims": refs,
                "conclusion": {"text": conclusion, "source": "theorem statement"},
                "arrows": [{
                    "from": "stated hypotheses (manual decomposition needed)",
                    "to": "stated conclusion",
                    "classification": status,
                    "evidence": evidence,
                }],
                "proofDisposition": status,
                "needsManualDecomposition": True,
            })
        orphan_proofs = [
            {"passageId": record["id"], "line": record.get("originalStartLine"),
             "excerpt": _excerpt(mask_comments(record["source"]))}
            for record in values
            if (record.get("kind") == "proof" or PROOF_HEADING.search(mask_comments(record["source"])))
            and record["id"] not in proof_passage_ids
        ]
        posts.append({
            "slug": slug,
            "title": item["title"],
            "file": item["file"],
            "selectionReason": reasons[slug],
            "theorems": theorems,
            "orphanProofPassages": orphan_proofs,
            "unresolvedFindings": findings_by_slug.get(slug, []),
            "summary": dict(sorted(Counter(theorem["proofDisposition"] for theorem in theorems).items())),
        })
    result = {
        "schema": 2,
        "auditOnly": True,
        "warning": (
            "Automatic classifications reflect only explicit nearby TeX evidence. "
            "Unclassified does not mean missing; genuinely-missing requires explicit gap wording. "
            "Proof-present means a proof was located, not verified. Legacy theorem headings and multiple statements "
            "within a passage are inventoried separately. Hypotheses and intermediate claims still require manual mathematical review."
        ),
        "classifications": ["proof-present", "cited", "postponed", "genuinely-missing", "unclassified"],
        "manualReviewComplete": False,
        "posts": posts,
    }
    result["sha256"] = sha256(stable_json(result))
    return result


def _added_links(before: dict | None, after: dict) -> list[dict]:
    if before is None:
        old_post, old_exact = [], []
    else:
        old_post, old_exact = before.get("postLinks", []), before.get("postLinksAt", [])
    added = []
    for link_type, values, expected in (
        ("post", (Counter(after.get("postLinks", [])) - Counter(old_post)).elements(), 2),
        ("exact", (Counter(after.get("postLinksAt", [])) - Counter(old_exact)).elements(), 3),
    ):
        for value in values:
            parts = _split_link(value, expected)
            added.append({
                "type": link_type, "targetSlug": parts[0],
                "targetLabel": parts[1] if expected == 3 else None,
                "linkedText": parts[-1],
            })
    return added


def build_review_model(
    baseline: dict, current: dict[str, dict], ledger: dict, manifest: list[dict]
) -> dict:
    before_by_id = baseline_records(baseline)
    ledger_by_id = {entry["passageId"]: entry for entry in ledger.get("entries", [])}
    item_by_file = {item["file"]: item for item in manifest}
    slug_by_file = {item["file"]: item["slug"] for item in manifest}
    passage_reviews = []
    for identifier, after in sorted(current.items(), key=lambda pair: (
        list(slug_by_file).index(pair[1]["currentFile"]) if pair[1]["currentFile"] in slug_by_file else 10**9,
        pair[1].get("currentOrdinal", 0), pair[0],
    )):
        before = before_by_id.get(identifier)
        ledger_entry = ledger_by_id.get(identifier)
        changed = before is None or before["canonicalSha256"] != after["canonicalSha256"]
        moved = bool(before and (
            before["originalFile"] != after["currentFile"]
            or before["originalOrdinal"] != after["currentOrdinal"]
        ))
        tokens = token_change(before["source"] if before else "", after["source"])
        passage_reviews.append({
            "passageId": identifier,
            "post": slug_by_file.get(after["currentFile"], after["currentFile"]),
            "title": item_by_file.get(after["currentFile"], {}).get("title", ""),
            "changed": changed,
            "moved": moved,
            "originalFile": before.get("originalFile") if before else None,
            "originalOrdinal": before.get("originalOrdinal") if before else None,
            "currentFile": after["currentFile"],
            "currentOrdinal": after["currentOrdinal"],
            "status": ledger_entry.get("status") if ledger_entry else ("new-unledgered" if changed else "unchanged"),
            "approval": ledger_entry.get("approval", {}).get("state") if ledger_entry else None,
            "reason": ledger_entry.get("reason") if ledger_entry else None,
            "evidence": ledger_entry.get("evidence") if ledger_entry else None,
            "tokenChange": tokens.as_dict(),
            "payloadChanges": readable_payload_changes(before, after) if before else {"newPassage": {"removed": [], "added": [after["source"]]}},
            "addedBlogPostLinks": _added_links(before, after),
            "before": before["source"] if before else "",
            "after": after["source"],
            "diff": unified_diff(before["source"] if before else "", after["source"], identifier) if changed else "",
        })
    findings = placeholder_findings(current, slug_by_file) + literal_formula_placeholders(current, slug_by_file)
    per_post = []
    reviews_by_post: dict[str, list[dict]] = defaultdict(list)
    for review in passage_reviews:
        reviews_by_post[review["post"]].append(review)
    findings_count = Counter(finding["post"] for finding in findings)
    for item in manifest:
        reviews = reviews_by_post.get(item["slug"], [])
        before_tokens = sum(review["tokenChange"]["before"] for review in reviews)
        after_tokens = sum(review["tokenChange"]["after"] for review in reviews)
        changed_tokens = sum(review["tokenChange"]["deleted"] + review["tokenChange"]["inserted"] for review in reviews)
        denominator = before_tokens + after_tokens
        per_post.append({
            "slug": item["slug"], "title": item["title"], "file": item["file"],
            "passages": len(reviews),
            "changedPassages": sum(review["changed"] for review in reviews),
            "movedPassages": sum(review["moved"] for review in reviews),
            "pendingApprovals": sum(review["changed"] and review["approval"] != "approved" for review in reviews),
            "changedTokenRatio": round(changed_tokens / denominator if denominator else 0, 6),
            "mathPayloadChanges": sum("math" in review["payloadChanges"] for review in reviews),
            "addedBlogPostLinks": sum(len(review["addedBlogPostLinks"]) for review in reviews),
            "unresolvedFindings": findings_count[item["slug"]],
        })
    return {
        "schema": 1,
        "baselineCommit": baseline.get("baseCommit"),
        "passages": passage_reviews,
        "unresolvedFindings": findings,
        "perPost": per_post,
    }


def _md(value) -> str:
    # Protected-payload signatures use NUL as an internal field separator.
    # Keep the human-readable report plain text while leaving the JSON audit
    # structures lossless.
    return str(value).replace("\0", " · ").replace("|", "\\|").replace("\n", " ")


def render_report(model: dict, link_graph: dict, proof_maps: dict, voice_drift: dict | None = None) -> str:
    voice_drift = voice_drift or {"posts": [], "summary": {}}
    changed = [review for review in model["passages"] if review["changed"]]
    moved = [review for review in model["passages"] if review["moved"]]
    links = [(review, link) for review in model["passages"] for link in review["addedBlogPostLinks"]]
    math_changed = [review for review in changed if "math" in review["payloadChanges"]]
    pending = [review for review in changed if review["approval"] != "approved"]
    lines = [
        "# Editorial review report", "",
        "> Audit aid only. This report does not certify mathematical correctness or author approval.", "",
        "The changed-token ratio is `(deleted + inserted) / (baseline tokens + current tokens)` "
        "over visible TeX tokens. Proof classifications use only explicit nearby evidence; "
        "`unclassified` never means `missing`.", "",
        "## Corpus summary", "",
        f"- Baseline commit: `{model.get('baselineCommit')}`",
        f"- Posts: **{len(model['perPost'])}**",
        f"- Current passages: **{len(model['passages'])}**",
        f"- Changed passages: **{len(changed)}**",
        f"- Moved passages: **{len(moved)}**",
        f"- Passages with mathematical payload changes: **{len(math_changed)}**",
        f"- Added `BlogPost`/`BlogPostAt` links: **{len(links)}**",
        f"- Pending changed-passage approvals: **{len(pending)}**",
        f"- Unresolved/placeholder findings: **{len(model['unresolvedFindings'])}**",
        f"- Internal links: **{len(link_graph['edges'])}**; broken targets: **{len(link_graph['diagnostics']['brokenTargets'])}**; broken exact labels: **{len(link_graph['diagnostics']['brokenLabels'])}**", "",
        "## Per-post summary", "",
        "| Post | Passages | Changed | Moved | Token ratio | Math changes | Added links | Pending | Findings |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for post in model["perPost"]:
        lines.append(
            f"| `{post['slug']}` | {post['passages']} | {post['changedPassages']} | "
            f"{post['movedPassages']} | {post['changedTokenRatio']:.4f} | "
            f"{post['mathPayloadChanges']} | {post['addedBlogPostLinks']} | "
            f"{post['pendingApprovals']} | {post['unresolvedFindings']} |"
        )
    lines.extend(["", "## Authorial-voice drift screening", ""])
    if voice_drift["posts"]:
        lines.extend([
            "This is a conservative review screen: mathematics is masked, and local editorial "
            "changes are paired rather than counted as replacement sentences.", "",
            "| Post | Prose ratio | Deleted sentences | New sentences | First-person delta | Question delta | Spelling conversions |",
            "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
        ])
        for post in voice_drift["posts"]:
            lines.append(
                f"| `{post['slug']}` | {post['changedProseRatio']:.4f} | "
                f"{len(post['deletedSentences'])} | {len(post['newSentences'])} | "
                f"{post['firstPerson']['delta']:+d} | {post['rhetoricalQuestions']['delta']:+d} | "
                f"{sum(entry['occurrences'] for entry in post['britishToAmerican'])} |"
            )
        detailed = [post for post in voice_drift["posts"] if post["needsReview"]]
        lines.extend(["", f"Posts carrying at least one review flag: **{len(detailed)}**.", ""])
        for post in detailed:
            lines.append(f"### Voice check: `{post['slug']}`")
            lines.append("")
            for finding in post["deletedSentences"]:
                lines.append(f"- Deleted sentence (`{finding['passageId']}`): {_md(finding['text'])}")
            for finding in post["newSentences"]:
                lines.append(f"- New sentence (`{finding['passageId']}`): {_md(finding['text'])}")
            if post["firstPerson"]["delta"] < 0:
                lines.append(
                    f"- First-person markers fell from {post['firstPerson']['before']} "
                    f"to {post['firstPerson']['after']}."
                )
            if post["rhetoricalQuestions"]["delta"] < 0:
                lines.append(
                    f"- Rhetorical/question sentences fell from {post['rhetoricalQuestions']['before']} "
                    f"to {post['rhetoricalQuestions']['after']}."
                )
            for spelling in post["britishToAmerican"]:
                lines.append(
                    f"- Possible British-to-American conversion: `{spelling['british']}` → "
                    f"`{spelling['american']}` ({spelling['occurrences']})."
                )
            for finding in post["genericReplacementSentences"]:
                lines.append(
                    f"- Possible generic replacement (`{finding['passageId']}`): {_md(finding['text'])}"
                )
            if (
                not post["deletedSentences"] and not post["newSentences"]
                and post["firstPerson"]["delta"] >= 0
                and post["rhetoricalQuestions"]["delta"] >= 0
                and not post["britishToAmerican"]
                and not post["genericReplacementSentences"]
            ):
                lines.append(f"- Prose changed-token ratio exceeds the 0.10 review threshold: {post['changedProseRatio']:.4f}.")
            lines.append("")
    else:
        lines.extend(["No voice-drift artifact was supplied.", ""])
    lines.extend(["", "## Moved passages", ""])
    if moved:
        for review in moved:
            lines.append(
                f"- `{review['passageId']}`: `{review['originalFile']}:{review['originalOrdinal']}` "
                f"\u2192 `{review['currentFile']}:{review['currentOrdinal']}`"
            )
    else:
        lines.append("No moved passages detected.")
    lines.extend(["", "## Added internal links", ""])
    if links:
        for review, link in links:
            anchor = f" at `{link['targetLabel']}`" if link["targetLabel"] else ""
            lines.append(
                f"- `{review['post']}` / `{review['passageId']}`: \u201c{_md(link['linkedText'])}\u201d "
                f"\u2192 `{link['targetSlug']}`{anchor} ({link['type']})"
            )
    else:
        lines.append("No new internal links detected.")
    lines.extend(["", "## Unresolved and placeholder findings", ""])
    if model["unresolvedFindings"]:
        for finding in model["unresolvedFindings"]:
            lines.append(
                f"- **{finding['severity']}** `{finding['post']}` `{finding['passageId']}` "
                f"line {finding['line']} ({finding['scope']}, {finding['category']}): "
                f"`{_md(finding['phrase'])}` \u2014 {_md(finding['excerpt'])}"
            )
    else:
        lines.append("No configured explicit placeholder phrases detected.")
    lines.extend(["", "## Passage-level before/after review", ""])
    if not changed:
        lines.append("No changed passages.")
    for review in changed:
        token = review["tokenChange"]
        lines.extend([
            f"### `{review['passageId']}` \u2014 {review['status']}", "",
            f"- Post: `{review['post']}`",
            f"- Location: `{review['originalFile']}:{review['originalOrdinal']}` \u2192 `{review['currentFile']}:{review['currentOrdinal']}`",
            f"- Approval: `{review['approval'] or 'none'}`",
            f"- Changed tokens: {token['deleted']} deleted, {token['inserted']} inserted; ratio **{token['ratio']:.4f}**",
        ])
        if review["reason"]:
            lines.append(f"- Ledger reason: {_md(review['reason'])}")
        if review["evidence"]:
            lines.append(f"- Ledger evidence: {_md(review['evidence'])}")
        if review["payloadChanges"]:
            lines.extend(["", "Protected-payload changes:", ""])
            for name, delta in review["payloadChanges"].items():
                lines.append(f"- `{name}`")
                for value in delta.get("removed", []):
                    lines.append(f"  - removed: `{_md(value)}`")
                for value in delta.get("added", []):
                    lines.append(f"  - added: `{_md(value)}`")
        lines.extend(["", "```diff", review["diff"].rstrip(), "```", ""])
    disposition = Counter(
        theorem["proofDisposition"]
        for post in proof_maps["posts"]
        for theorem in post["theorems"]
    )
    lines.extend([
        "## Proof-integrity screening summary", "",
        f"Sensitive posts screened: **{len(proof_maps['posts'])}**. Explicit theorem-like passages: "
        f"**{sum(disposition.values())}**.", "",
    ])
    for status in proof_maps["classifications"]:
        lines.append(f"- `{status}`: {disposition[status]}")
    lines.extend(["", "These are source-evidence classifications, not completed hypothesis-to-conclusion proof maps. "
                  "`proof-present` does not certify a proof. Manual decomposition remains outstanding and must not be reported as complete.", ""])
    lines.extend(["", "Full audit structures are in `internal-link-graph.json`, `proof-integrity-maps.json`, and `voice-drift.json`.", ""])
    return "\n".join(lines)


def generate() -> tuple[str, dict, dict, dict]:
    baseline = json.loads(BASELINE_PATH.read_text())
    current, errors = current_records()
    if errors:
        raise ValueError("Cannot generate review artifacts:\n- " + "\n- ".join(errors))
    manifest = load_manifest()
    model = build_review_model(baseline, current, load_ledger(), manifest)
    graph = build_link_graph(manifest, current)
    proofs = build_proof_maps(manifest, current, model["unresolvedFindings"])
    voice = build_voice_drift(manifest, model["passages"])
    return render_report(model, graph, proofs, voice), graph, proofs, voice


def _serialized(report: str, graph: dict, proofs: dict, voice: dict) -> dict[Path, str]:
    return {
        REPORT_PATH: report.rstrip() + "\n",
        LINK_GRAPH_PATH: json.dumps(graph, ensure_ascii=False, indent=2) + "\n",
        PROOF_MAPS_PATH: json.dumps(proofs, ensure_ascii=False, indent=2) + "\n",
        VOICE_DRIFT_PATH: json.dumps(voice, ensure_ascii=False, indent=2) + "\n",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify committed artifacts without writing")
    parser.add_argument("--public", action="store_true", help="also reject literal formula placeholders and visible TODO/TBD/FIXME markers")
    args = parser.parse_args()
    report, graph, proofs, voice = generate()
    artifacts = _serialized(report, graph, proofs, voice)
    if args.public:
        records, _ = current_records()
        slug_by_file = {item["file"]: item["slug"] for item in load_manifest()}
        blockers = literal_formula_placeholders(records, slug_by_file) + [
            item for item in placeholder_findings(records, slug_by_file)
            if item["category"] == "editorial-marker" and item["scope"] == "visible"
        ]
        if blockers:
            print("Unresolved literal placeholders block publication: " + ", ".join(item["passageId"] for item in blockers), file=sys.stderr)
            return 1
    if args.check:
        stale = [str(path.relative_to(ROOT)) for path, content in artifacts.items() if not path.exists() or path.read_text() != content]
        if stale:
            print("Stale or missing editorial-review artifacts: " + ", ".join(stale), file=sys.stderr)
            return 1
        print(f"Editorial review artifacts are current ({len(graph['nodes'])} posts, {len(graph['edges'])} links).")
        return 0
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for path, content in artifacts.items():
        path.write_text(content)
    print(
        f"Wrote {REPORT_PATH.relative_to(ROOT)}, {LINK_GRAPH_PATH.relative_to(ROOT)}, "
        f"{PROOF_MAPS_PATH.relative_to(ROOT)}, and {VOICE_DRIFT_PATH.relative_to(ROOT)}."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
