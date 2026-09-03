"""Regression checks for the source constructs used by the restored posts."""
import re
import unittest
from references import anchor_id, reference_index, prepare_references, restore_anchors, link_numbered_references

ITEM = {'file':'example.tex','slug':'example','collection':'example'}


class ReferenceTests(unittest.TestCase):
    def prepare(self, text):
        index = reference_index([(ITEM, text)])
        return prepare_references(text, ITEM, index), index

    def test_tag_after_label_overrides_equation_number(self):
        (source, markers), index = self.prepare(r'\begin{equation}\label{eq:test}x=1\tag{$*$}\end{equation} See \eqref{eq:test}.')
        self.assertEqual(index[('example','eq:test')]['value'], '*')
        self.assertIn('{(*)}', source)
        self.assertLess(source.index('BLOGANCHOR'), source.index(r'\begin{equation}'))
        self.assertEqual(len(markers), 1)

    def test_star_math_is_not_double_wrapped(self):
        (source, _), _ = self.prepare(r'\begin{equation}\label{eq:star}x=1\tag{$\star$}\end{equation} \eqref{eq:star}')
        self.assertIn(r'{$(\star)$}', source)
        self.assertNotIn(r'$($', source)

    def test_duplicate_labels_are_rejected_even_in_one_post(self):
        with self.assertRaisesRegex(ValueError, 'Duplicate source label'):
            self.prepare(r'\begin{theorem}\label{same}\label{same}Text\end{theorem}')

    def test_source_counters_and_cross_post_destinations(self):
        other = {**ITEM, 'file':'other.tex', 'slug':'other'}
        target = r'\setcounter{theorem}{6}\begin{lemma}\label{target}Text\end{lemma}'
        index = reference_index([(other,target),(ITEM,r'See Lemma~\ref{target}.')])
        source, _ = prepare_references(r'See Lemma~\ref{target}.', ITEM, index)
        self.assertIn(r'\#/post/other?ref=', source)
        self.assertTrue(source.endswith('{7}.'))

    def test_figure_target_precedes_picture_and_caption_disappears(self):
        (source, _), _ = self.prepare(r'\begin{figure}\includegraphics{diagram.pdf}\FigureTag{SC6}{fig:test}\end{figure}')
        self.assertLess(source.index('BLOGANCHOR'), source.index(r'\includegraphics'))
        self.assertNotIn('FigureTag', source)
        self.assertNotIn('SC6', source)

    def test_lost_anchors_fail_instead_of_silently_breaking_links(self):
        with self.assertRaisesRegex(ValueError, 'lost during conversion'):
            restore_anchors('<p>Text</p>', {'BLOGANCHORTESTEND':'<span id="test"></span>'})

    def test_unnumbered_remark_does_not_inherit_previous_theorem(self):
        _, index = self.prepare(r'\setcounter{theorem}{10}\begin{theorem}T\end{theorem}\begin{remark}\label{remark}R\end{remark}')
        self.assertEqual(index[('example','remark')]['value'], '')

    def test_theorem_anchor_moves_only_to_its_own_heading(self):
        fragment = '<h1>Introduction</h1><p>Opening.</p><h2>Theorem 1</h2><p>BLOGANCHORTESTEND Statement.</p>'
        result = restore_anchors(fragment, {'BLOGANCHORTESTEND':'<span id="test" class="reference-target" aria-hidden="true"></span>'})
        self.assertTrue(result.startswith('<h1>Introduction</h1><p>Opening.</p>'))
        self.assertLess(result.index('id="test"'),result.index('<h2>Theorem'))
        self.assertGreater(result.index('id="test"'),result.index('Opening.'))

    def test_plain_numbered_references_skip_headings_math_and_existing_links(self):
        post = {'slug':'example','html':'<h2 id="lemma-1">Lemma 1</h2><p>Use Lemma 1. <a href="elsewhere">Lemma 1</a> <span class="math inline">Lemma 1</span></p>'}
        link_numbered_references([post], [ITEM])
        self.assertEqual(post['html'].count('class="mathematical-reference"'), 1)
        self.assertIn('<h2 id="lemma-1">Lemma 1</h2>', post['html'])

    def test_ambiguous_plain_reference_is_not_guessed(self):
        posts = [{'slug':slug,'html':'<h2 id="theorem-1">Theorem 1</h2><p>Theorem 1 applies.</p>'} for slug in ['a','b']]
        link_numbered_references(posts, [{**ITEM,'slug':'a'},{**ITEM,'slug':'b'}])
        self.assertTrue(all('mathematical-reference' not in post['html'] for post in posts))


if __name__ == '__main__':
    unittest.main()
