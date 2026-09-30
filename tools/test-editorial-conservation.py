#!/usr/bin/env python3
"""Regression tests for the conservation-first manuscript workflow."""

import json
import hashlib
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import editorial_conservation as guard


class ScannerTests(unittest.TestCase):
    def test_comment_mask_keeps_every_offset(self):
        source = "Text $x$. % hidden $y$\nNext $z$.\n"
        masked = guard.mask_comments(source)
        self.assertEqual(len(masked), len(source))
        self.assertEqual(masked.index("Next"), source.index("Next"))
        self.assertEqual([atom.source for atom in guard.math_atoms(source)], ["$x$", "$z$"])

    def test_marker_insertion_is_byte_for_byte_reversible(self):
        body = "% Source page 1\nFirst paragraph with $x$.\n\nSecond paragraph.\n"
        marked = guard.insert_markers(body, "sample")
        self.assertEqual(guard.remove_markers(marked), body)
        passages, errors = guard.scan_passages(marked, "sample.tex")
        self.assertFalse(errors)
        self.assertEqual(len(passages), 2)

    def test_atomic_environment_is_never_split_at_internal_blank_lines(self):
        body = (
            "\\begin{theorem}\nStatement.\n\nStill the statement.\n"
            "\\end{theorem}\n\nAfterwards.\n"
        )
        marked = guard.insert_markers(body, "sample")
        passages, errors = guard.scan_passages(marked, "sample.tex")
        self.assertFalse(errors)
        self.assertEqual(len(passages), 2)
        self.assertIn("Still the statement", passages[0].source)

    def test_nested_footnote_and_graphics_options_are_protected(self):
        source = (
            r"Text\footnote{A note with \emph{nested words}.} "
            r"\includegraphics[width=.8\linewidth]{figures/a.svg}"
        )
        data = guard.payload(source)
        self.assertEqual(data["figures"], ["figures/a.svg"])
        self.assertEqual(data["footnotes"][0]["source"], r"A note with \emph{nested words}.")

    def test_small_footnote_edit_is_paired_but_math_change_is_not(self):
        old = guard.payload(r"Text\footnote{For details refer \cite{source}; take $x$.}")
        edited = guard.payload(r"Text\footnote{For details, refer to \cite{source}; take $x$.}")
        changed_math = guard.payload(r"Text\footnote{For details, refer to \cite{source}; take $y$.}")
        self.assertTrue(guard.mechanically_paired_footnotes(old, edited))
        self.assertFalse(guard.mechanically_paired_footnotes(old, changed_math))

    def test_hidden_mathematics_is_identified(self):
        source = "% Source page 14 Since $f(x)=x$ for every $x$ in the open domain, the conclusion follows.\n"
        self.assertTrue(guard.hidden_substantive_text(source))
        self.assertEqual(guard.passage_kind(source), "hidden-source")


class EndToEndTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        (self.root / "tools").mkdir()
        manifest = [{
            "slug": "sample", "file": "01-sample.tex", "title": "Sample",
            "collection": "sample", "phase": 1, "phaseLabel": "Sample",
        }, {
            "slug": "other", "file": "02-other.tex", "title": "Other",
            "collection": "sample", "phase": 1, "phaseLabel": "Sample",
        }]
        (self.root / "tools/manifest.json").write_text(json.dumps(manifest))
        (self.root / "01-sample.tex").write_text(
            "\\documentclass{article}\n\\section*{Sample}\n"
            "% BLOG-CONTENT-BEGIN\nA sentence with $x+1$.\n% BLOG-CONTENT-END\n"
        )
        (self.root / "02-other.tex").write_text(
            "\\documentclass{article}\n% BLOG-CONTENT-BEGIN\n"
            "Another proof with $y+1$.\n% BLOG-CONTENT-END\n"
        )
        self.baseline = self.root / "tools/editorial-baseline.json"
        self.ledger = self.root / "tools/editorial-ledger.json"
        self.patches = (
            patch.object(guard, "ROOT", self.root),
            patch.object(guard, "BASELINE_PATH", self.baseline),
            patch.object(guard, "LEDGER_PATH", self.ledger),
            patch.object(guard, "git_revision", return_value="test-revision"),
        )
        for item in self.patches:
            item.start()
        self.ledger.write_text('{"schema":2,"entries":[],"releaseApproval":null}\n')
        guard.freeze_baseline()

    def tearDown(self):
        for item in reversed(self.patches):
            item.stop()
        self.temporary.cleanup()

    def change_formula(self):
        path = self.root / "01-sample.tex"
        path.write_text(path.read_text().replace("$x+1$", "$x+2$"))

    def test_unledgered_mathematical_change_fails(self):
        self.change_formula()
        result = guard.audit_project("review")
        self.assertTrue(any("no ledger entry" in error for error in result["errors"]))

    def test_pending_mathematical_change_passes_review_but_not_public(self):
        self.change_formula()
        guard.draft_ledger("Correct a demonstrable mathematical typo.")
        self.assertFalse(guard.audit_project("review")["errors"])
        public = guard.audit_project("public")
        self.assertTrue(any("not been approved" in error for error in public["errors"]))

    def test_missing_marker_and_passage_fails(self):
        path = self.root / "01-sample.tex"
        path.write_text(path.read_text().replace("% BLOG-PASSAGE: sample:p0001\nA sentence with $x+1$.\n", ""))
        result = guard.audit_project("review")
        self.assertTrue(any("Missing original passage" in error or "no BLOG-PASSAGE" in error for error in result["errors"]))

    def restore_author_version(self):
        """An independently pinned fixture replaces a complete original passage."""
        original = (self.root / "01-sample.tex").read_text()
        snapshot = guard.remove_markers(original).replace("A sentence with $x+1$.", "Author's version with $x+2$.")
        snapshot_path = "tools/author-version.tex"
        (self.root / snapshot_path).write_text(snapshot)
        pinned = {
            "file": "01-sample.tex", "snapshotFile": snapshot_path,
            "snapshotSha256": guard.sha256(snapshot), "sourceCommit": "a" * 40,
            "sourceGitBlobSha1": hashlib.sha1(
                b"blob " + str(len(snapshot.encode())).encode() + b"\0" + snapshot.encode()
            ).hexdigest(),
        }
        pin_patch = patch.object(guard, "AUTHOR_VERSION_SNAPSHOTS", {"sample": pinned})
        pin_patch.start()
        self.addCleanup(pin_patch.stop)
        prefix, body, suffix = guard.document_parts(snapshot, pinned["file"])
        marked = guard.insert_markers(body, "sample").replace("sample:p0001", "sample:n0001")
        (self.root / pinned["file"]).write_text(prefix + marked + suffix)
        baseline = json.loads(self.baseline.read_text())
        entry = {
            **pinned, "slug": "sample",
            "baselineBodySha256": baseline["posts"][0]["bodyRawSha256BeforeMarkers"],
            "reason": "Restore the author's chosen historical version.",
            "evidence": "Exact historical source was compared before restoration.",
            "approval": {
                "state": "approved", "approvedBy": "Author", "approvedAt": "2026-09-30",
                "evidence": "Author explicitly approved restoring this historical version only.",
            },
        }
        ledger = {"schema": 2, "entries": [], "authorVersions": [entry], "releaseApproval": None}
        self.ledger.write_text(json.dumps(ledger))
        return ledger

    def test_exact_author_version_passes_review_keeps_baseline_and_reports_omission(self):
        before = self.baseline.read_bytes()
        self.restore_author_version()
        result = guard.audit_project("review")
        self.assertFalse(result["errors"])
        self.assertEqual(self.baseline.read_bytes(), before)
        withdrawn = [item for item in result["passages"] if item["passageId"] == "sample:p0001"]
        self.assertEqual(withdrawn[0]["status"], "superseded-by-approved-author-version")
        self.assertIn("-A sentence with $x+1$.", withdrawn[0]["diff"])
        self.assertTrue(withdrawn[0]["payloadChanges"]["math"]["removed"])
        guard.draft_ledger("Unrelated future editorial pass")
        self.assertFalse(guard.audit_project("review")["errors"])

    def test_author_version_does_not_authorize_publication(self):
        ledger = self.restore_author_version()
        result = guard.audit_project("public")
        self.assertTrue(any("no release approval" in error for error in result["errors"]))
        ledger["releaseApproval"] = {
            "state": "approved", "approvedBy": "Author",
            "sourceSetSha256": result["sourceSetSha256"], "ledgerSha256": guard.ledger_digest(ledger),
        }
        self.ledger.write_text(json.dumps(ledger))
        self.assertFalse(guard.audit_project("public")["errors"])

    def test_author_version_rejects_unapproved_later_edit_including_header(self):
        self.restore_author_version()
        path = self.root / "01-sample.tex"
        source = path.read_text()
        for changed in (source.replace("$x+2$", "$x$"), source.replace("{Sample}", "{Changed title}")):
            with self.subTest(changed=changed):
                path.write_text(changed)
                result = guard.audit_project("review")
                self.assertTrue(any("not the exact approved author version" in error for error in result["errors"]))

    def test_author_version_rejects_forged_snapshot_even_if_ledger_hashes_change(self):
        ledger = self.restore_author_version()
        snapshot = self.root / "tools/author-version.tex"
        snapshot.write_text(snapshot.read_text().replace("$x+2$", "$0$"))
        ledger["authorVersions"][0]["snapshotSha256"] = guard.sha256(snapshot.read_bytes())
        self.ledger.write_text(json.dumps(ledger))
        result = guard.audit_project("review")
        self.assertTrue(any("pinned" in error or "historical Git blob" in error for error in result["errors"]))

    def test_author_version_requires_matching_baseline_hash_and_explicit_approval(self):
        ledger = self.restore_author_version()
        for field, replacement in (("baselineBodySha256", "bad"), ("approval", {"state": "pending"})):
            with self.subTest(field=field):
                changed = json.loads(json.dumps(ledger))
                changed["authorVersions"][0][field] = replacement
                self.ledger.write_text(json.dumps(changed))
                self.assertTrue(guard.audit_project("review")["errors"])

    def test_author_version_cannot_exempt_other_posts_or_foreign_markers(self):
        self.restore_author_version()
        other = self.root / "02-other.tex"
        other.write_text(other.read_text().replace("Another proof with $y+1$.", "Short replacement."))
        self.assertTrue(any("no ledger entry" in error for error in guard.audit_project("review")["errors"]))
        source = self.root / "01-sample.tex"
        source.write_text(source.read_text().replace("sample:n0001", "other:p0001"))
        self.assertTrue(any("foreign passage marker" in error for error in guard.audit_project("review")["errors"]))

    def test_unknown_post_cannot_claim_author_version_exemption(self):
        ledger = self.restore_author_version()
        ledger["authorVersions"][0]["slug"] = "other"
        self.ledger.write_text(json.dumps(ledger))
        result = guard.audit_project("review")
        self.assertTrue(any("no pinned historical author version" in error for error in result["errors"]))


if __name__ == "__main__":
    unittest.main()
