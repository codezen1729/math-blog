#!/usr/bin/env python3
"""Regression tests for the conservation-first manuscript workflow."""

import json
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
        }]
        (self.root / "tools/manifest.json").write_text(json.dumps(manifest))
        (self.root / "01-sample.tex").write_text(
            "\\documentclass{article}\n\\section*{Sample}\n"
            "% BLOG-CONTENT-BEGIN\nA sentence with $x+1$.\n% BLOG-CONTENT-END\n"
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


if __name__ == "__main__":
    unittest.main()
