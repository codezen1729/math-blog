#!/usr/bin/env python3
"""Tests for the deterministic editorial review artifacts."""

from __future__ import annotations

import json
from pathlib import Path
import unittest

import editorial_review as review
from editorial_conservation import canonicalize_tex, payload, sha256


def record(identifier: str, filename: str, ordinal: int, source: str, kind: str = "prose") -> dict:
    value = {
        "id": identifier,
        "originalFile": filename,
        "originalOrdinal": ordinal,
        "originalStartLine": ordinal * 10,
        "currentFile": filename,
        "currentOrdinal": ordinal,
        "kind": kind,
        "source": source,
        "rawSha256": sha256(source),
        "canonicalSha256": sha256(canonicalize_tex(source)),
    }
    value.update(payload(source))
    return value


def baseline_for(posts: list[dict], records: list[dict]) -> dict:
    by_file = {post["file"]: post for post in posts}
    output = []
    for filename in by_file:
        values = []
        for source_record in records:
            if source_record["originalFile"] != filename:
                continue
            value = dict(source_record)
            value.pop("currentFile", None)
            value.pop("currentOrdinal", None)
            values.append(value)
        output.append({
            "slug": by_file[filename]["slug"], "file": filename,
            "title": by_file[filename]["title"],
            "passageIds": [value["id"] for value in values], "passages": values,
        })
    return {"schema": 2, "baseCommit": "fixture", "posts": output}


class TokenAndPayloadTests(unittest.TestCase):
    def test_changed_token_ratio_is_symmetric_and_bounded(self) -> None:
        forward = review.token_change("Alpha beta.", "Alpha gamma delta.")
        backward = review.token_change("Alpha gamma delta.", "Alpha beta.")
        self.assertEqual(forward.deleted + forward.inserted, backward.deleted + backward.inserted)
        self.assertEqual(forward.ratio, backward.ratio)
        self.assertGreater(forward.ratio, 0)
        self.assertLessEqual(forward.ratio, 1)

    def test_math_payload_delta_contains_readable_tex(self) -> None:
        before = record("a:p0001", "a.tex", 1, "The value is $x+1$.")
        after = record("a:p0001", "a.tex", 1, "The value is $y+1$.")
        delta = review.readable_payload_changes(before, after)
        self.assertEqual(delta["math"]["removed"], ["inline: $x+1$"])
        self.assertEqual(delta["math"]["added"], ["inline: $y+1$"])

    def test_voice_screen_pairs_local_editorial_changes(self) -> None:
        before = "What do we gain here? We analyse the colour of $J(f)$; then we continue."
        after = "What do we gain here? We analyse the colour of $J(f)$, and then we continue."
        deleted, introduced = review.sentence_drift(before, after)
        self.assertEqual(deleted, [])
        self.assertEqual(introduced, [])

    def test_voice_screen_pairs_a_sentence_split(self) -> None:
        before = "Set the lattice here, then define the resulting complex torus."
        after = "Set the lattice here. Then define the resulting complex torus."
        deleted, introduced = review.sentence_drift(before, after)
        self.assertEqual(deleted, [])
        self.assertEqual(introduced, [])

    def test_voice_screen_reports_replacement_and_spelling_drift(self) -> None:
        manifest = [{"slug": "a", "title": "A", "file": "a.tex"}]
        passage = {
            "passageId": "a:p0001", "post": "a", "currentOrdinal": 1,
            "before": "We analyse the colour in this neighbourhood. What shall we do next?",
            "after": "In this article, the color is described. The conclusion is immediate.",
        }
        voice = review.build_voice_drift(manifest, [passage])
        post = voice["posts"][0]
        self.assertTrue(post["deletedSentences"])
        self.assertTrue(post["newSentences"])
        self.assertLess(post["firstPerson"]["delta"], 0)
        self.assertLess(post["rhetoricalQuestions"]["delta"], 0)
        self.assertTrue(post["genericReplacementSentences"])
        self.assertEqual(post["britishToAmerican"], [{
            "british": "colour", "american": "color", "occurrences": 1,
        }])


class LinkGraphTests(unittest.TestCase):
    def test_exact_targets_repeats_forward_links_and_isolation(self) -> None:
        manifest = [
            {"slug": "a", "title": "A", "file": "a.tex", "collection": "x", "phase": 1},
            {"slug": "b", "title": "B", "file": "b.tex", "collection": "x", "phase": 1},
            {"slug": "c", "title": "C", "file": "c.tex", "collection": "x", "phase": 1},
        ]
        a = record(
            "a:p0001", "a.tex", 1,
            r"\BlogPost{b}{next}\BlogPost{b}{next}\BlogPostAt{b}{tool:x}{exact}",
        )
        b = record("b:p0001", "b.tex", 1, r"\begin{tool}{x}Result.\end{tool}", "tool")
        c = record("c:p0001", "c.tex", 1, "Alone.")
        graph = review.build_link_graph(manifest, {value["id"]: value for value in (a, b, c)})
        exact = next(edge for edge in graph["edges"] if edge["type"] == "exact")
        self.assertEqual(exact["targetLabel"], "tool:x")
        self.assertEqual(exact["linkedText"], "exact")
        self.assertTrue(exact["labelExists"])
        self.assertEqual(len(graph["diagnostics"]["repeatedEdges"]), 1)
        self.assertEqual(graph["diagnostics"]["isolatedPosts"], ["c"])
        self.assertEqual(len(graph["diagnostics"]["forwardLinks"]), 3)


class ReviewModelTests(unittest.TestCase):
    def test_report_includes_moves_links_math_and_before_after_diff(self) -> None:
        manifest = [
            {"slug": "a", "title": "A", "file": "a.tex", "collection": "x", "phase": 1},
            {"slug": "b", "title": "B", "file": "b.tex", "collection": "x", "phase": 1},
        ]
        old = record("a:p0001", "a.tex", 1, "Old $x$.\n")
        new = record("a:p0001", "a.tex", 2, r"New $y$. \BlogPost{b}{next}." + "\n")
        ledger = {"schema": 2, "entries": [{
            "passageId": old["id"], "status": "mathematically-corrected",
            "reason": "fixture", "evidence": "test", "approval": {"state": "pending"},
        }]}
        model = review.build_review_model(
            baseline_for(manifest, [old]), {new["id"]: new}, ledger, manifest,
        )
        graph = review.build_link_graph(manifest, {new["id"]: new})
        proofs = review.build_proof_maps(manifest, {new["id"]: new}, [])
        voice = review.build_voice_drift(manifest, model["passages"])
        markdown = review.render_report(model, graph, proofs, voice)
        self.assertTrue(model["passages"][0]["moved"])
        self.assertEqual(model["passages"][0]["addedBlogPostLinks"][0]["targetSlug"], "b")
        self.assertIn("math", model["passages"][0]["payloadChanges"])
        self.assertIn("## Moved passages", markdown)
        self.assertIn("## Added internal links", markdown)
        self.assertIn("## Authorial-voice drift screening", markdown)
        self.assertIn("-Old $x$.", markdown)
        self.assertIn("+New $y$.", markdown)

    def test_placeholder_scan_is_conservative(self) -> None:
        ordinary = record("a:p0001", "a.tex", 1, "Lift anything using this covering map.")
        marked = record("a:p0002", "a.tex", 2, "% TODO: verify.\nFill in the gaps.")
        findings = review.placeholder_findings(
            {ordinary["id"]: ordinary, marked["id"]: marked}, {"a.tex": "a"},
        )
        self.assertEqual({finding["scope"] for finding in findings}, {"comment", "visible"})
        self.assertFalse(any(finding["passageId"] == ordinary["id"] for finding in findings))

    def test_domain_qualification_is_a_review_warning_not_a_formula_blocker(self) -> None:
        value = record("a:p0001", "a.tex", 1, "Hence, if defined, $f(x)=y$.")
        findings = review.placeholder_findings({value["id"]: value}, {"a.tex": "a"})
        self.assertEqual([(x["category"], x["severity"]) for x in findings], [("domain-qualification", "review")])
        self.assertEqual(review.literal_formula_placeholders({value["id"]: value}, {"a.tex": "a"}), [])

    def test_literal_formula_placeholders_cannot_hide_among_legitimate_lifting_prose(self) -> None:
        source = "Lift anything here.\n% $h=(anything)$ is an old source comment.\n" + r"\[h=(anything)\circ (lift).\]"
        value = record("a:p0001", "a.tex", 1, source)
        findings = review.literal_formula_placeholders({value["id"]: value}, {"a.tex": "a"})
        self.assertEqual([x["phrase"] for x in findings], ["anything", "(lift)"])
        self.assertTrue(all(x["line"] == 12 and x["severity"] == "blocking" for x in findings))


class ProofMapTests(unittest.TestCase):
    def test_proof_dispositions_require_explicit_evidence(self) -> None:
        manifest = [{
            "slug": "classification-fatou-components", "title": "Sensitive",
            "file": "s.tex", "collection": "dynamics", "phase": 4,
        }]
        fixtures = [
            record("s:p0001", "s.tex", 1, r"\begin{theorem}A.\end{theorem}", "theorem"),
            record("s:p0002", "s.tex", 2, r"\begin{proof}Proof of A.\end{proof}", "proof"),
            record("s:p0003", "s.tex", 3, r"\begin{lemma}B. The proof is deferred.\end{lemma}", "lemma"),
            record("s:p0004", "s.tex", 4, r"\begin{theorem}C follows by \cite{Source}.\end{theorem}", "theorem"),
            record("s:p0005", "s.tex", 5, r"\begin{proposition}D has a missing step.\end{proposition}", "proposition"),
            record("s:p0006", "s.tex", 6, r"\begin{corollary}E.\end{corollary}", "corollary"),
        ]
        proof_maps = review.build_proof_maps(
            manifest, {value["id"]: value for value in fixtures}, [],
        )
        statuses = [item["proofDisposition"] for item in proof_maps["posts"][0]["theorems"]]
        self.assertEqual(statuses, ["proof-present", "postponed", "cited", "genuinely-missing", "unclassified"])
        self.assertTrue(all(item["needsManualDecomposition"] for item in proof_maps["posts"][0]["theorems"]))

    def test_legacy_headings_and_multiple_theorems_are_not_lost(self) -> None:
        manifest = [{"slug": "first-surgery", "title": "Sullivan", "file": "a.tex"}]
        values = [record("a:p0001", "a.tex", 1, r"\subsection*{Theorem 4.1 (No Wandering)} Statement.", "heading"),
                  record("a:p0002", "a.tex", 2, r"\textit{Proof.} A proof text.", "prose"),
                  record("a:p0003", "a.tex", 3, r"\begin{lemma}\label{a}A.\end{lemma}\begin{lemma}\label{b}B.\end{lemma}", "lemma")]
        result = review.build_proof_maps(manifest, {value["id"]: value for value in values}, [])
        theorems = result["posts"][0]["theorems"]
        self.assertEqual(len(theorems), 3)
        self.assertEqual(theorems[0]["title"], "Theorem 4.1 (No Wandering)")
        self.assertEqual(theorems[0]["proofDisposition"], "proof-present")
        self.assertEqual(theorems[1]["labels"], ["a"])
        self.assertEqual(theorems[2]["labels"], ["b"])
        self.assertNotEqual(theorems[1]["sourceSliceSha256"], theorems[2]["sourceSliceSha256"])
        self.assertFalse(result["manualReviewComplete"])


class CorpusIntegrationTests(unittest.TestCase):
    def test_committed_artifacts_are_deterministic_and_current(self) -> None:
        first = review.generate()
        second = review.generate()
        self.assertEqual(review._serialized(*first), review._serialized(*second))
        serialized = review._serialized(*first)
        for path, expected in serialized.items():
            self.assertTrue(path.exists(), path)
            self.assertEqual(path.read_text(), expected, path)
        graph = first[1]
        proofs = first[2]
        voice = first[3]
        self.assertEqual(len(graph["nodes"]), 84)
        self.assertTrue(graph["edges"])
        self.assertTrue(proofs["auditOnly"])
        self.assertEqual(len(voice["posts"]), 84)
        self.assertTrue(any(post["theorems"] for post in proofs["posts"]))


if __name__ == "__main__":
    unittest.main()
