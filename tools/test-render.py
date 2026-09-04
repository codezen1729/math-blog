"""Regression checks for source-derived titles and author-friendly blog links."""
import json
from pathlib import Path
import unittest

from render import expand_blog_post_links, extract_post_title


class PostTitleTests(unittest.TestCase):
    def document(self, title_command: str) -> str:
        return (
            "\\documentclass{article}\n"
            f"{title_command}\n"
            "% BLOG-CONTENT-BEGIN\n"
            "Post body.\n"
            "% BLOG-CONTENT-END\n"
        )

    def test_extracts_the_single_title_before_the_content_marker(self):
        document = self.document(
            "\\section *\n"
            "  {A \\textit{Nested {Title}} and 100\\% Ideas}"
        )
        self.assertEqual(
            extract_post_title(document, "example.tex"),
            r"A \textit{Nested {Title}} and 100\% Ideas",
        )

    def test_ignores_commented_titles_and_sections_inside_the_post(self):
        document = (
            "% \\section*{Commented out}\n"
            "\\section*{The Public Title}\n"
            "% BLOG-CONTENT-BEGIN\n"
            "\\section*{An internal section}\n"
            "% BLOG-CONTENT-END\n"
        )
        self.assertEqual(extract_post_title(document, "example.tex"), "The Public Title")

    def test_rejects_missing_duplicate_blank_and_unbalanced_titles(self):
        missing = self.document("\\subsection*{Not a title}")
        duplicate = self.document("\\section*{One}\n\\section*{Two}")
        blank = self.document("\\section*{   }")
        unbalanced = self.document("\\section*{Incomplete")
        with self.assertRaisesRegex(ValueError, r"exactly one \\section"):
            extract_post_title(missing, "missing.tex")
        with self.assertRaisesRegex(ValueError, r"exactly one \\section"):
            extract_post_title(duplicate, "duplicate.tex")
        with self.assertRaisesRegex(ValueError, "blank"):
            extract_post_title(blank, "blank.tex")
        with self.assertRaisesRegex(ValueError, "Unbalanced braces"):
            extract_post_title(unbalanced, "unbalanced.tex")

    def test_every_published_source_has_one_extractable_title(self):
        project = Path(__file__).resolve().parents[1]
        manifest = json.loads((project / "tools/manifest.json").read_text())
        for item in manifest:
            with self.subTest(file=item["file"]):
                title = extract_post_title(
                    (project / item["file"]).read_text(), item["file"]
                )
                self.assertTrue(title.strip())


class BlogPostLinkTests(unittest.TestCase):
    slugs = {"complex-differentiation", "goursat-cauchy"}

    def test_expands_a_valid_link_and_preserves_nested_label_markup(self):
        source = (
            r"Continue with \BlogPost{complex-differentiation}"
            r"{the \emph{Complex {Differentiation}} post}."
        )
        self.assertEqual(
            expand_blog_post_links(source, "example.tex", self.slugs),
            r"Continue with \href{\#/post/complex-differentiation}"
            r"{the \emph{Complex {Differentiation}} post}.",
        )

    def test_ignores_commented_and_escaped_commands(self):
        source = (
            "% \\BlogPost{not-a-post}{commented}\n"
            r"\\BlogPost{not-a-post}{shown literally}"
        )
        self.assertEqual(
            expand_blog_post_links(source, "example.tex", self.slugs), source
        )

    def test_rejects_unknown_malformed_and_blank_links(self):
        cases = [
            (r"\BlogPost{unknown}{Unknown}", "Unknown blog-post slug"),
            (r"\BlogPost{Bad Slug}{Bad}", "Unknown blog-post slug"),
            (r"\BlogPost{goursat-cauchy}{}", r"Blank \\BlogPost label"),
            (r"\BlogPost goursat-cauchy{Bad}", "Expected a braced argument"),
            (r"\BlogPost{goursat-cauchy}{Incomplete", "Unbalanced braces"),
        ]
        for source, message in cases:
            with self.subTest(source=source):
                with self.assertRaisesRegex(ValueError, message):
                    expand_blog_post_links(source, "example.tex", self.slugs)


if __name__ == "__main__":
    unittest.main()
