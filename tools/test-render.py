"""Regression checks for source-derived titles and author-friendly blog links."""
import json
from pathlib import Path
import re
import unittest

from render import (
    PREVIEW_SENTINEL,
    archived_figure_descriptions,
    expand_blog_post_links,
    extract_post_title,
    opening_excerpt,
    normalize_heading_hierarchy,
    prepare_preview_marker,
    split_rendered_preview,
    search_record,
)
from latex_to_web import clean_tex


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


class WebTypesettingTests(unittest.TestCase):
    def test_search_includes_only_this_articles_figures_without_changing_its_opening(self):
        fragment = '<h2>Tool 2</h2><p>The original opening.</p><img src="figures/a&amp;b.svg"><img src="figures/a&amp;b.svg">'
        post = {"slug": "example", "title": "Example", "phaseLabel": "Tools", "html": fragment}
        record = search_record(post, {
            "figures/a&b.svg": "A polygon with opposite edges identified.",
            "figures/other.svg": "An unrelated diagram.",
        })
        self.assertEqual(record["text"], "Tool 2 The original opening. A polygon with opposite edges identified.")
        self.assertEqual(record["figureDescriptions"], ["A polygon with opposite edges identified."])
        self.assertEqual(record["headings"], ["Tool 2"])
        self.assertEqual(post["html"], fragment)

    def test_search_without_figures_keeps_complete_article(self):
        post = {"slug": "example", "title": "Example", "phaseLabel": "Tools", "html": "<p>First.</p><p>Last.</p>"}
        self.assertEqual(search_record(post, {})["text"], "First. Last.")
        self.assertEqual(search_record(post, {})["figureDescriptions"], [])

    def test_original_mathematical_caption_survives_as_a_description(self):
        posts = [{"html": '<figure><img src="figures/polygon.svg"><figcaption>'
                  '<span class="math inline">\\(P\\)</span> represents the surface.'
                  '</figcaption></figure>'}]
        self.assertEqual(archived_figure_descriptions(posts), {
            'figures/polygon.svg': r'\(P\) represents the surface.',
        })

    def test_bare_qed_is_kept_as_math_for_browser_rendering(self):
        source = "Proof complete.\n\\qed\n\nAlready inline: $\\qed$.\nInside math: $x=1.\\qedhere$"
        cleaned = clean_tex(source)
        self.assertIn("Proof complete.\n$\\qed$\n\n", cleaned)
        self.assertIn("Already inline: $\\qed$.", cleaned)
        self.assertIn("Inside math: $x=1.\\qedhere$", cleaned)


class BlogPostLinkTests(unittest.TestCase):
    slugs = {"complex-differentiation", "goursat-cauchy"}
    targets = {
        ("goursat-cauchy", "thm:cauchy"): {
            "id": "tex-1234567890abcdef", "slug": "goursat-cauchy",
            "label": "thm:cauchy", "value": "4",
        }
    }

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

    def test_expands_an_exact_labelled_post_link(self):
        source = r"Use \BlogPostAt{goursat-cauchy}{thm:cauchy}{Cauchy's theorem}."
        self.assertEqual(
            expand_blog_post_links(source, "example.tex", self.slugs, self.targets),
            r"Use \href{\#/post/goursat-cauchy?ref=tex-1234567890abcdef}{Cauchy's theorem}.",
        )

    def test_rejects_an_unknown_exact_target(self):
        with self.assertRaisesRegex(ValueError, "Unknown labelled blog-post target"):
            expand_blog_post_links(
                r"\BlogPostAt{goursat-cauchy}{missing}{result}",
                "example.tex", self.slugs, self.targets,
            )


class OpeningExcerptTests(unittest.TestCase):
    def test_heading_normalization_only_lowers_skipped_levels(self):
        fragment = '<h1 id="z">Z</h1><h2 id="a">A</h2><h4 id="b">B</h4><h3 id="c">C</h3><h2 id="d">D</h2>'
        self.assertEqual(
            normalize_heading_hierarchy(fragment),
            '<h2 id="z">Z</h2><h2 id="a">A</h2><h3 id="b">B</h3><h3 id="c">C</h3><h2 id="d">D</h2>',
        )

    def test_source_preview_marker_is_singular_and_block_bounded(self):
        source = "First paragraph.\n\n\\BlogPreviewEnd\n\nSecond paragraph.\n"
        prepared, marked = prepare_preview_marker(source, "example.tex")
        self.assertTrue(marked)
        self.assertIn(PREVIEW_SENTINEL, prepared)
        self.assertNotIn(r"\BlogPreviewEnd", prepared)
        with self.assertRaisesRegex(ValueError, "at most one"):
            prepare_preview_marker(source + "\n\\BlogPreviewEnd\n", "twice.tex")
        with self.assertRaisesRegex(ValueError, "alone on a line"):
            prepare_preview_marker("Text \\BlogPreviewEnd here", "inline.tex")

    def test_rendered_preview_boundary_is_removed_without_changing_article_blocks(self):
        fragment = (
            '<p>The exact opening.</p>'
            f'<p>{PREVIEW_SENTINEL}</p>'
            '<p>The rest of the article.</p>'
        )
        article, excerpt = split_rendered_preview(fragment, "example.tex")
        self.assertEqual(article, '<p>The exact opening.</p><p>The rest of the article.</p>')
        self.assertEqual(excerpt, '<p>The exact opening.</p>')

    def test_uses_the_first_three_readable_paragraphs_in_order(self):
        fragment = (
            '<p>A short but genuine opening paragraph.</p>'
            '<p>The second paragraph follows it.</p>'
            '<p>The third paragraph completes the preview.</p>'
            '<p>The fourth paragraph belongs only on the article page.</p>'
        )
        self.assertEqual(
            opening_excerpt(fragment),
            '<p>A short but genuine opening paragraph.</p>'
            '<p>The second paragraph follows it.</p>'
            '<p>The third paragraph completes the preview.</p>',
        )

    def test_preserves_a_display_formula_and_figure_before_the_opening_prose(self):
        fragment = (
            '<h3>Tool 2 — Real-Part Formula for the Modulus</h3>'
            '<p><span class="math display">x^2</span></p>'
            '<p><img src="figure.svg"></p>'
            '<p>The first explanatory sentence begins here.</p>'
        )
        self.assertEqual(
            opening_excerpt(fragment),
            '<h3>Tool 2 — Real-Part Formula for the Modulus</h3>'
            '<p><span class="math display">x^2</span></p>'
            '<p><img src="figure.svg"></p>'
            '<p>The first explanatory sentence begins here.</p>',
        )

    def test_keeps_a_brief_opening_and_continues_forward(self):
        fragment = '<p>Why bundles?</p><p>A later and substantially longer paragraph.</p>'
        self.assertEqual(
            opening_excerpt(fragment),
            '<p>Why bundles?</p><p>A later and substantially longer paragraph.</p>',
        )

    def test_keeps_opening_prose_while_removing_its_display_formula(self):
        fragment = (
            '<p>The argument begins with the following identity. '
            '<span class="math display">\\[x^2+y^2=1\\]</span></p>'
            '<p>A later paragraph must not replace it.</p>'
        )
        self.assertEqual(
            opening_excerpt(fragment),
            '<p>The argument begins with the following identity. '
            '<span class="math display">\\[x^2+y^2=1\\]</span></p>'
            '<p>A later paragraph must not replace it.</p>',
        )

    def test_keeps_opening_prose_while_removing_its_footnote_marker(self):
        fragment = (
            '<p>The opening remains here<a href="#fn1" class="footnote-ref"><sup>1</sup></a>.</p>'
            '<p>A later paragraph must not replace it.</p>'
        )
        self.assertEqual(
            opening_excerpt(fragment),
            '<p>The opening remains here<a href="#fn1" class="footnote-ref"><sup>1</sup></a>.</p>'
            '<p>A later paragraph must not replace it.</p>',
        )

    def test_preserves_series_navigation_before_the_opening_prose(self):
        fragment = (
            '<p><a href="#one">McMullen’s Surgery: Part I</a> '
            '<span class="math inline">\\(\\,\\cdot\\,\\)</span> '
            '<a href="#two">Part II</a> · <a href="#three">Part III</a></p>'
            '<p>The construction begins with a rational map.</p>'
        )
        self.assertEqual(
            opening_excerpt(fragment),
            '<p><a href="#one">McMullen’s Surgery: Part I</a> '
            '<span class="math inline">\\(\\,\\cdot\\,\\)</span> '
            '<a href="#two">Part II</a> · <a href="#three">Part III</a></p>'
            '<p>The construction begins with a rational map.</p>',
        )

    def test_preserves_roman_numeral_section_labels(self):
        fragment = (
            '<p>II) Algebraic Perspective</p>'
            '<p>Suppose an elliptic curve is given in Weierstrass form.</p>'
        )
        self.assertEqual(
            opening_excerpt(fragment),
            '<p>II) Algebraic Perspective</p>'
            '<p>Suppose an elliptic curve is given in Weierstrass form.</p>',
        )

    def test_preserves_intervening_figures_and_headings_without_gaps(self):
        fragment = (
            '<h3>The opening tool</h3>'
            '<p>The first paragraph introduces it.</p>'
            '<figure><img src="one.svg"></figure>'
            '<h4>An application</h4>'
            '<p>The second paragraph applies it.</p>'
            '<table><tr><td>A diagrammatic step.</td></tr></table>'
            '<p>The third paragraph completes the preview.</p>'
            '<p>The fourth paragraph belongs only in the article.</p>'
        )
        self.assertEqual(
            opening_excerpt(fragment),
            '<h3>The opening tool</h3>'
            '<p>The first paragraph introduces it.</p>'
            '<figure><img src="one.svg"></figure>'
            '<h4>An application</h4>'
            '<p>The second paragraph applies it.</p>'
            '<table><tr><td>A diagrammatic step.</td></tr></table>'
            '<p>The third paragraph completes the preview.</p>',
        )

    def test_preserves_short_proof_labels_after_the_preview_begins(self):
        fragment = (
            '<p>The theorem starts the story.</p>'
            '<p><em>Proof.</em></p>'
            '<p>The first step follows from compactness.</p>'
            '<p>The second step completes the argument.</p>'
            '<p>This paragraph is beyond the preview.</p>'
        )
        self.assertEqual(
            opening_excerpt(fragment),
            '<p>The theorem starts the story.</p>'
            '<p><em>Proof.</em></p>'
            '<p>The first step follows from compactness.</p>'
            '<p>The second step completes the argument.</p>',
        )

    def test_preserves_list_structure_in_the_opening_passage(self):
        fragment = (
            '<p>There are three routes into the subject.</p>'
            '<ul><li><p>The geometric route.</p></li>'
            '<li><p>The algebraic route.</p></li>'
            '<li><p>The analytic route.</p></li>'
            '<li><p>The fourth route is beyond the preview.</p></li></ul>'
            '<p>The discussion after the list belongs to the article.</p>'
        )
        self.assertEqual(
            opening_excerpt(fragment),
            '<p>There are three routes into the subject.</p>'
            '<ul><li><p>The geometric route.</p></li>'
            '<li><p>The algebraic route.</p></li></ul>',
        )

    def test_preserves_and_limits_a_description_list(self):
        fragment = (
            '<p>The problems begin here.</p><dl>'
            '<dt>1.</dt><dd><p>The first problem.</p></dd>'
            '<dt>2.</dt><dd><p>The second problem.</p></dd>'
            '<dt>3.</dt><dd><p>The third problem.</p></dd></dl>'
        )
        self.assertEqual(
            opening_excerpt(fragment),
            '<p>The problems begin here.</p><dl>'
            '<dt>1.</dt><dd><p>The first problem.</p></dd>'
            '<dt>2.</dt><dd><p>The second problem.</p></dd></dl>',
        )


class PublishedSourceHygieneTests(unittest.TestCase):
    def test_published_posts_do_not_expose_editorial_placeholders(self):
        project = Path(__file__).resolve().parents[1]
        manifest = json.loads((project / "tools/manifest.json").read_text())
        editorial_scaffolding = re.compile(
            r"Author check:|\[(?:unfinished|missing|illegible|unclear)[^\]]*\]"
            r"|The source (?:records|also records)|Source note:",
            flags=re.I,
        )
        for item in manifest:
            source = (project / item["file"]).read_text()
            body = source.split("% BLOG-CONTENT-BEGIN", 1)[1].split("% BLOG-CONTENT-END", 1)[0]
            self.assertIsNone(editorial_scaffolding.search(body), item["file"])


if __name__ == "__main__":
    unittest.main()
