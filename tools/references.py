"""Keep LaTeX labels and cross-post references navigable in the static blog."""
import hashlib
import html
import re
from collections import defaultdict
from html.parser import HTMLParser


def anchor_id(collection, label):
    return 'tex-' + hashlib.sha256((collection + '\0' + label).encode()).hexdigest()[:16]


def reference_index(documents):
    """Read the source counters before theorem environments become HTML headings."""
    index = {}
    families = {'theorem': 'theorem', 'lemma': 'theorem', 'proposition': 'theorem', 'corollary': 'theorem', 'conjecture': 'theorem', 'definition': 'definition', 'example': 'example', 'namedtool': 'namedtoolcounter'}
    unnumbered = {'remark', 'claim', 'exercise', 'question', 'observation'}
    tokens = re.compile(r'\\setcounter\{([^{}]+)\}\{(\d+)\}|\\begin\{(' + '|'.join(families) + '|' + '|'.join(unnumbered) + r'|equation)\}|\\begin\{tool\}\{([^{}]+)\}|\\FigureTag\{([^{}]+)\}\{([^{}]+)\}|\\tag\{([^{}]+)\}|\\label\{([^{}]+)\}')
    for item, source in documents:
        counters = defaultdict(int)
        current = ''
        source = re.sub(r'(?m)(?<!\\)%.*$', '', source)
        def tag_before_label(match):
            if r'\tag{' not in match[0]:
                return match[0]
            labels = re.findall(r'\\label\{[^{}]+\}', match[0])
            return re.sub(r'\\label\{[^{}]+\}', '', match[0]) + ''.join(labels)
        source = re.sub(r'\$\$.*?\$\$|\\\[.*?\\\]|\\begin\{(equation\*?|align\*?|gather\*?|multline\*?)\}.*?\\end\{\1\}', tag_before_label, source, flags=re.S)
        for match in tokens.finditer(source):
            label = None
            if match[1]:
                counters[match[1]] = int(match[2])
            elif match[3]:
                if match[3] in unnumbered:
                    current = ''
                else:
                    counter = families.get(match[3], match[3])
                    counters[counter] += 1
                    current = str(counters[counter])
            elif match[4]:
                current, label = match[4], 'tool:' + match[4]
            elif match[5]:
                current, label = match[5], match[6]
            elif match[7]:
                current = match[7].strip().strip('$')
            else:
                label = match[8]
            if label:
                key = (item['collection'], label)
                target = {'slug': item['slug'], 'id': anchor_id(*key), 'value': current, 'label': label}
                if key in index:
                    raise ValueError(f'Duplicate source label: {key}')
                index[key] = target
    return index


def prepare_references(text, item, index):
    markers = {}

    def marker(label):
        target = index[(item['collection'], label)]
        token = 'BLOGANCHOR' + target['id'][4:].upper() + 'END'
        markers[token] = '<span id="' + target['id'] + '" class="reference-target" aria-hidden="true"></span>'
        return token

    # Keep the label and target, but not the printed handout figure number.
    text = re.sub(r'\\FigureTag\{[^{}]*\}\{([^{}]*)\}', lambda m: r'\label{' + m[1] + '}', text)
    def figure_labels_first(match):
        labels = re.findall(r'\\label\{[^{}]+\}', match[0])
        return ''.join(labels) + '\n' + re.sub(r'\\label\{[^{}]+\}', '', match[0])
    text = re.sub(r'\\begin\{figure\}.*?\\end\{figure\}', figure_labels_first, text, flags=re.S)
    text = re.sub(r'(\\begin\{tool\}\{([^{}]+)\})', lambda m: marker('tool:' + m[2]) + '\n' + m[1], text)

    # An HTML anchor must be outside the equation's MathJax/KaTeX payload.
    displays = r'\$\$.*?\$\$|\\\[.*?\\\]|\\begin\{(equation\*?|align\*?|gather\*?|multline\*?)\}.*?\\end\{\1\}'
    def move_labels(match):
        labels = re.findall(r'\\label\{([^{}]+)\}', match[0])
        clean = re.sub(r'\\label\{[^{}]+\}', '', match[0])
        return ''.join(marker(label) + '\n' for label in labels) + clean
    text = re.sub(displays, move_labels, text, flags=re.S)
    text = re.sub(r'\\label\{([^{}]+)\}', lambda m: marker(m[1]), text)

    def reference(match):
        command, label = match[1], match[2]
        if command == 'ToolRef':
            label = 'tool:' + label
        target = index.get((item['collection'], label))
        if not target or not target['value']:
            raise ValueError(f'Unresolved {command} in {item["file"]}: {label}')
        href = ('#' + target['id']) if target['slug'] == item['slug'] else '#/post/' + target['slug'] + '?ref=' + target['id']
        value = target['value']
        if command == 'eqref':
            value = '(' + value + ')'
        if '\\' in value:
            value = '$' + value + '$'
        if command == 'ToolRef':
            value = 'Tool ' + value
        return r'\href{' + href.replace('#', r'\#') + '}{' + value + '}'
    text = re.sub(r'\\(ref|eqref|ToolRef)\{([^{}]+)\}', reference, text)
    return text, markers


def restore_anchors(fragment, markers):
    for token, anchor in markers.items():
        if token not in fragment:
            raise ValueError(f'A source-reference target was lost during conversion: {token}')
        fragment = fragment.replace(token, anchor)
    # Empty anchor paragraphs should not introduce extra vertical spacing.
    fragment = re.sub(r'<p>\s*((?:<span\b[^>]*class="reference-target"[^>]*></span>\s*)+)</p>', r'\1', fragment)
    # Stay within exactly one heading: a broad DOTALL wildcard here can move
    # a later theorem/figure target all the way to the start of the article.
    heading_target = r'(<h([1-6])\b[^>]*>(?:(?!</?h[1-6]\b).)*?</h\2>)(\s*)(<p>\s*)?((?:<span\b[^>]*class="reference-target"[^>]*></span>\s*)+)'
    fragment = re.sub(heading_target, lambda m: m[5] + m[1] + m[3] + (m[4] or ''), fragment, flags=re.S)
    return fragment


def link_numbered_references(posts, manifest):
    """Link the author's plain 'Theorem 4.1' references when the target is unique."""
    targets = defaultdict(list)
    kinds = r'Theorem|Lemma|Proposition|Corollary|Definition|Tool'
    heading = re.compile(r'<h[1-6]\b[^>]*\bid="([^"]+)"[^>]*>(.*?)</h[1-6]>', re.S)
    for item, post in zip(manifest, posts):
        for match in heading.finditer(post['html']):
            plain = html.unescape(re.sub(r'<[^>]*>', '', match[2]))
            label = re.match(r'\s*(' + kinds + r')\s+(\d+(?:\.\d+)*)\b', plain)
            if label:
                key = (item['collection'], label[1].lower(), label[2])
                targets[key].append((post['slug'], match[1]))

    class Linker(HTMLParser):
        def __init__(self, item):
            super().__init__(convert_charrefs=False)
            self.item, self.parts, self.stack = item, [], []

        def handle_starttag(self, tag, attrs):
            self.parts.append(self.get_starttag_text())
            if tag not in {'img', 'br', 'hr', 'input', 'meta', 'link', 'wbr', 'source'}:
                skip = tag in {'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'code', 'pre'} or any(k == 'class' and v and ('math' in v.split() or 'citation' in v.split()) for k, v in attrs)
                self.stack.append((tag, skip))

        def handle_endtag(self, tag):
            self.parts.append('</' + tag + '>')
            if self.stack and self.stack[-1][0] == tag:
                self.stack.pop()

        def handle_startendtag(self, tag, attrs):
            self.parts.append(self.get_starttag_text())

        def handle_data(self, data):
            if not any(skip for _, skip in self.stack):
                def replace(match):
                    key = (self.item['collection'], match[1].lower(), match[2])
                    choices = targets.get(key, [])
                    if len(choices) != 1:
                        return match[0]
                    slug, anchor = choices[0]
                    href = '#' + anchor if slug == self.item['slug'] else '#/post/' + slug + '?ref=' + anchor
                    return '<a class="mathematical-reference" href="' + html.escape(href, quote=True) + '">' + match[0] + '</a>'
                data = re.sub(r'\b(' + kinds + r')\s+(\d+(?:\.\d+)*)\b', replace, data)
            self.parts.append(data)

        def handle_entityref(self, name):
            self.parts.append('&' + name + ';')

        def handle_charref(self, name):
            self.parts.append('&#' + name + ';')

        def handle_comment(self, data):
            self.parts.append('<!--' + data + '-->')

    for item, post in zip(manifest, posts):
        parser = Linker(item)
        parser.feed(post['html'])
        post['html'] = ''.join(parser.parts)
