#!/usr/bin/env python3
"""Compile independent Overleaf essays into a staged website, never edit sources."""
import argparse
import hashlib
import html
import json
import math
import re
import shutil
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import quote
import latex_to_web as converter
from references import reference_index, prepare_references, restore_anchors, link_numbered_references
from editorial_conservation import audit_project


SHARED_MATH_MACROS = json.loads((Path(__file__).resolve().parent / "shared-macros.json").read_text())


def _is_escaped(text: str, index: int) -> bool:
    backslashes = 0
    index -= 1
    while index >= 0 and text[index] == "\\":
        backslashes += 1
        index -= 1
    return backslashes % 2 == 1


def _without_tex_comments(text: str) -> str:
    """Remove TeX comments while preserving line boundaries."""
    cleaned = []
    for line in text.splitlines(keepends=True):
        comment = next((index for index, char in enumerate(line) if char == "%" and not _is_escaped(line, index)), None)
        if comment is None:
            cleaned.append(line)
        elif line.endswith("\n"):
            cleaned.append(line[:comment] + "\n")
        else:
            cleaned.append(line[:comment])
    return "".join(cleaned)


def _braced_argument(text: str, start: int, context: str) -> tuple[str, int]:
    if start >= len(text) or text[start] != "{":
        raise ValueError(f"Expected a braced argument for {context}")
    depth = 1
    cursor = start + 1
    while cursor < len(text) and depth:
        if text[cursor] == "{" and not _is_escaped(text, cursor):
            depth += 1
        elif text[cursor] == "}" and not _is_escaped(text, cursor):
            depth -= 1
        cursor += 1
    if depth:
        raise ValueError(f"Unbalanced braces in {context}")
    return text[start + 1:cursor - 1], cursor


def extract_post_title(document: str, filename: str) -> str:
    """Return the sole pre-content section title; it is the public post title."""
    marker = "% BLOG-CONTENT-BEGIN"
    if marker not in document:
        raise ValueError(f"Missing blog content marker in {filename}")
    prefix = _without_tex_comments(document.split(marker, 1)[0])
    command = re.compile(r"\\section\s*\*\s*\{")
    titles = []
    cursor = 0
    while match := command.search(prefix, cursor):
        title, cursor = _braced_argument(prefix, match.end() - 1, f"the post title in {filename}")
        titles.append(title.strip())
    if len(titles) != 1:
        raise ValueError(f"Keep exactly one \\section*{{...}} title before the content marker in {filename}")
    if not titles[0]:
        raise ValueError(f"The post title is blank in {filename}")
    return titles[0]


def _inside_tex_comment(text: str, index: int) -> bool:
    line_start = text.rfind("\n", 0, index) + 1
    return any(char == "%" and not _is_escaped(text, position) for position, char in enumerate(text[line_start:index], line_start))


def expand_blog_post_links(text: str, filename: str, slugs: set[str], exact_targets: dict[tuple[str, str], dict] | None = None) -> str:
    """Validate and expand author-friendly links to posts and labelled passages."""
    exact_targets = exact_targets or {}
    exact_command = re.compile(r"\\BlogPostAt(?![A-Za-z@])")
    cursor = 0
    while match := exact_command.search(text, cursor):
        if _is_escaped(text, match.start()) or _inside_tex_comment(text, match.start()):
            cursor = match.end()
            continue
        argument_start = match.end()
        while argument_start < len(text) and text[argument_start].isspace():
            argument_start += 1
        slug, after_slug = _braced_argument(text, argument_start, f"\\BlogPostAt in {filename}")
        label_start = after_slug
        while label_start < len(text) and text[label_start].isspace():
            label_start += 1
        source_label, after_source_label = _braced_argument(text, label_start, f"\\BlogPostAt in {filename}")
        visible_start = after_source_label
        while visible_start < len(text) and text[visible_start].isspace():
            visible_start += 1
        visible, end = _braced_argument(text, visible_start, f"\\BlogPostAt in {filename}")
        slug, source_label = slug.strip(), source_label.strip()
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug) or slug not in slugs:
            raise ValueError(f"Unknown blog-post slug in {filename}: {slug}")
        target = exact_targets.get((slug, source_label))
        if not source_label or not target:
            raise ValueError(f"Unknown labelled blog-post target in {filename}: {slug} / {source_label}")
        if not visible.strip():
            raise ValueError(f"Blank \\BlogPostAt label in {filename}: {slug} / {source_label}")
        href = r"\#/post/" + slug + "?ref=" + target["id"]
        replacement = r"\href{" + href + "}{" + visible + "}"
        text = text[:match.start()] + replacement + text[end:]
        cursor = match.start() + len(replacement)

    command = re.compile(r"\\BlogPost(?![A-Za-z@])")
    cursor = 0
    while match := command.search(text, cursor):
        if _is_escaped(text, match.start()) or _inside_tex_comment(text, match.start()):
            cursor = match.end()
            continue
        argument_start = match.end()
        while argument_start < len(text) and text[argument_start].isspace():
            argument_start += 1
        slug, after_slug = _braced_argument(text, argument_start, f"\\BlogPost in {filename}")
        label_start = after_slug
        while label_start < len(text) and text[label_start].isspace():
            label_start += 1
        label, end = _braced_argument(text, label_start, f"\\BlogPost in {filename}")
        slug = slug.strip()
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug) or slug not in slugs:
            raise ValueError(f"Unknown blog-post slug in {filename}: {slug}")
        if not label.strip():
            raise ValueError(f"Blank \\BlogPost label in {filename}: {slug}")
        replacement = r"\href{\#/post/" + slug + "}{" + label + "}"
        text = text[:match.start()] + replacement + text[end:]
        cursor = match.start() + len(replacement)
    return text


_VOID_HTML_TAGS = frozenset({
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
    "meta", "param", "source", "track", "wbr",
})


class _TopLevelBlockParser(HTMLParser):
    """Retain complete top-level HTML blocks without flattening lists."""

    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.blocks: list[str] = []
        self._stack: list[str] = []
        self._current: list[str] | None = None

    def _append(self, value: str):
        if self._current is not None:
            self._current.append(value)

    def _finish_if_top_level(self):
        if self._current is not None and not self._stack:
            self.blocks.append("".join(self._current))
            self._current = None

    def handle_starttag(self, tag, attrs):
        if self._current is None:
            self._current = []
        self._append(self.get_starttag_text() or f"<{tag}>")
        if tag not in _VOID_HTML_TAGS:
            self._stack.append(tag)
        self._finish_if_top_level()

    def handle_startendtag(self, tag, attrs):
        if self._current is None:
            self._current = []
        self._append(self.get_starttag_text() or f"<{tag} />")
        self._finish_if_top_level()

    def handle_endtag(self, tag):
        self._append(f"</{tag}>")
        if tag in self._stack:
            position = len(self._stack) - 1 - self._stack[::-1].index(tag)
            del self._stack[position:]
        self._finish_if_top_level()

    def handle_data(self, data):
        self._append(data)

    def handle_entityref(self, name):
        self._append(f"&{name};")

    def handle_charref(self, name):
        self._append(f"&#{name};")

    def handle_comment(self, data):
        self._append(f"<!--{data}-->")

    def close(self):
        super().close()
        if self._current:
            self.blocks.append("".join(self._current))
            self._current = None


def _top_level_blocks(fragment: str) -> list[str]:
    parser = _TopLevelBlockParser()
    parser.feed(fragment)
    parser.close()
    return parser.blocks


def _is_genuine_prose(paragraph: str) -> bool:
    candidate = re.sub(r'<span\b[^>]*class="[^"]*\bmath display\b[^"]*"[^>]*>.*?</span>', ' ', paragraph, flags=re.S)
    candidate = re.sub(r'<a\b(?=[^>]*class="[^"]*\bfootnote-ref\b[^"]*")[^>]*>.*?</a>', '', candidate, flags=re.S)
    candidate = re.sub(r'<img\b[^>]*>', '', candidate, flags=re.S)
    plain = html.unescape(re.sub(r"<[^>]+>", " ", candidate))
    plain = re.sub(r"\s+", " ", plain).strip()
    navigation_parts = re.findall(r"\bPart\s+[IVXLCDM]+\b", plain, flags=re.I)
    roman_section_label = re.fullmatch(
        r"[IVXLCDM]+\s*[.)]\s*(?:Prologue|[^.!?]{1,70}\bPerspective)\.?",
        plain,
        flags=re.I,
    )
    return bool(
        len(plain) >= 8
        and re.search(r"[A-Za-z]", plain)
        and not re.fullmatch(r"(?:proof|remark|note|example|definition|theorem)\.?", plain, flags=re.I)
        and len(navigation_parts) < 2
        and not roman_section_label
    )


def _truncate_opening_list(block: str, needed: int) -> tuple[str, int]:
    """Keep complete leading list entries until the excerpt has enough prose."""
    match = re.fullmatch(r'\s*(<(?P<tag>ul|ol|dl)\b[^>]*>)(.*)(</(?P=tag)>)\s*', block, flags=re.S | re.I)
    if not match:
        return block, sum(
            _is_genuine_prose(paragraph)
            for paragraph in re.findall(r"<p(?:\s[^>]*)?>.*?</p>", block, flags=re.S)
        )
    kept = []
    count = 0
    list_tag = match.group("tag").lower()
    for item in _top_level_blocks(match.group(3)):
        child_tag = re.match(r"\s*<([a-z0-9]+)\b", item, flags=re.I)
        if not child_tag or child_tag.group(1).lower() not in ({"li"} if list_tag in {"ul", "ol"} else {"dt", "dd"}):
            continue
        kept.append(item)
        count += sum(
            _is_genuine_prose(paragraph)
            for paragraph in re.findall(r"<p(?:\s[^>]*)?>.*?</p>", item, flags=re.S)
        )
        if count >= needed and (list_tag != "dl" or child_tag.group(1).lower() == "dd"):
            break
    if not kept:
        return block, 0
    return match.group(1) + "".join(kept) + match.group(4), count


def opening_excerpt(fragment: str, paragraph_limit: int = 3) -> str:
    """Keep a gap-free opening prefix through at least three prose paragraphs."""
    selected = []
    paragraph_count = 0
    for block in _top_level_blocks(fragment):
        paragraphs = re.findall(r"<p(?:\s[^>]*)?>.*?</p>", block, flags=re.S)
        genuine = sum(_is_genuine_prose(paragraph) for paragraph in paragraphs)
        if genuine and re.match(r"\s*<(?:ul|ol|dl)\b", block, flags=re.I):
            block, genuine = _truncate_opening_list(block, paragraph_limit - paragraph_count)
        selected.append(block)
        paragraph_count += genuine
        if paragraph_count >= paragraph_limit:
            break
    return "".join(selected)


PREVIEW_SENTINEL = "BLOGPREVIEWENDMARKER91C78C"


def prepare_preview_marker(source: str, filename: str) -> tuple[str, bool]:
    """Replace one source-only preview boundary with an unambiguous sentinel."""
    count = source.count(r"\BlogPreviewEnd")
    if count > 1:
        raise ValueError(f"{filename}: use at most one \\BlogPreviewEnd marker")
    if not count:
        return source, False
    match = re.search(r"(?m)^[ \t]*\\BlogPreviewEnd[ \t]*(?:%[^\n]*)?$", source)
    if not match:
        raise ValueError(f"{filename}: put \\BlogPreviewEnd alone on a line between complete blocks")
    before, after = source[:match.start()], source[match.end():]
    if before and not before.endswith("\n\n"):
        raise ValueError(f"{filename}: \\BlogPreviewEnd must follow a complete top-level block")
    if after.startswith("\n"):
        after = after[1:]
    return before + f"\n\n{PREVIEW_SENTINEL}\n\n" + after, True


def split_rendered_preview(fragment: str, filename: str) -> tuple[str, str | None]:
    """Remove the rendered marker and return its exact opening HTML prefix."""
    if PREVIEW_SENTINEL not in fragment:
        return fragment, None
    pattern = re.compile(rf"\s*<p(?:\s[^>]*)?>\s*{PREVIEW_SENTINEL}\s*</p>\s*", re.I)
    match = pattern.search(fragment)
    if not match or pattern.search(fragment, match.end()):
        raise ValueError(f"{filename}: the preview boundary did not render at one block boundary")
    return fragment[:match.start()] + fragment[match.end():], fragment[:match.start()]


def plain_text(fragment: str) -> str:
    value = re.sub(r"<script\b[^>]*>.*?</script>|<style\b[^>]*>.*?</style>", " ", fragment, flags=re.S | re.I)
    value = html.unescape(re.sub(r"<[^>]+>", " ", value))
    return re.sub(r"\s+", " ", value).strip()


def archived_figure_descriptions(posts: list[dict]) -> dict[str, str]:
    """Retain the author's original captions when visible titles were removed."""
    descriptions = {}
    for post in posts:
        for figure in re.findall(r"<figure\b[^>]*>.*?</figure>", post["html"], flags=re.S | re.I):
            caption = re.search(r"<figcaption\b[^>]*>(.*?)</figcaption>", figure, flags=re.S | re.I)
            if not caption or not plain_text(caption[1]):
                continue
            for src in re.findall(r'<img\b[^>]*src="([^"]+)"', figure, flags=re.I):
                descriptions.setdefault(html.unescape(src), plain_text(caption[1]))
    return descriptions


def normalize_heading_hierarchy(fragment: str) -> str:
    """Keep source heading order while preventing skipped HTML levels.

    The page title is the sole h1.  LaTeX paragraph headings may otherwise
    arrive from Pandoc as h4 immediately after an h2; lowering only such a
    skipped level preserves the authored hierarchy and accessible outline.
    """
    previous = 1

    def replace(match: re.Match[str]) -> str:
        nonlocal previous
        source_level = int(match.group(1))
        # Any further LaTeX chapter/section after the page title is content,
        # so even a Pandoc h1 becomes h2 within the article.
        desired_level = max(2, source_level)
        level = min(desired_level, previous + 1)
        previous = level
        return f"<h{level}{match.group(2)}>{match.group(3)}</h{level}>"

    return re.sub(r"<h([1-6])(\b[^>]*)>(.*?)</h\1>", replace, fragment, flags=re.S | re.I)

def render(project: Path, site: Path):
    conservation = audit_project("review")
    if conservation["errors"]:
        raise RuntimeError("The manuscript conservation review failed; no website was rendered.")
    manifest = json.loads((project / "tools/manifest.json").read_text())
    baseline_posts = json.loads((project / "tools/baseline-posts.json").read_text())
    posts_by_slug = {post["slug"]: post for post in baseline_posts}
    if len(posts_by_slug) != len(baseline_posts):
        raise ValueError("Duplicate slugs in the baseline post catalog")
    missing = [item["slug"] for item in manifest if item["slug"] not in posts_by_slug]
    if missing:
        raise ValueError(f"Published posts missing from the baseline catalog: {', '.join(missing)}")
    posts = []
    for order, item in enumerate(manifest, start=1):
        post = posts_by_slug[item["slug"]].copy()
        # The manifest is the publication sequence and the public series index.
        # Keeping these fields here prevents stale catalogue numbers after a
        # pedagogical reorder or series rename.
        post.update(
            order=order,
            phase=item["phase"],
            phaseLabel=item["phaseLabel"],
        )
        posts.append(post)
    assert len(posts) >= 28
    assert len({item['slug'] for item in manifest}) == len(manifest)
    # External figures are fixed inputs in this first wording-editing workflow.
    # Reject changed uploads instead of silently reusing an old website picture.
    for name, digest in json.loads((project / "tools/figure-hashes.json").read_text()).items():
        if hashlib.sha256((project / name).read_bytes()).hexdigest() != digest:
            raise RuntimeError(f"Figure changed: {name}. Re-export its website illustration before publishing.")
    converter.ROOT = site
    converter.SOURCE = project / "tools/profiles"
    pandoc = shutil.which("pandoc")
    if not pandoc:
        raise RuntimeError("Pandoc is required to build the website")
    documents = []
    for item in manifest:
        file = project / item["file"]
        assert file.parent == project and file.suffix == ".tex"
        document = file.read_text()
        assert document.count("% BLOG-CONTENT-BEGIN") == document.count("% BLOG-CONTENT-END") == 1, f"Keep the blog content markers in {file.name}"
        source = document.split("% BLOG-CONTENT-BEGIN\n", 1)[1].split("% BLOG-CONTENT-END", 1)[0]
        documents.append((item, source, extract_post_title(document, file.name)))
    references = reference_index([(item, source) for item, source, _ in documents])
    exact_targets = {(target['slug'], target['label']): target for target in references.values()}
    slugs = {item["slug"] for item in manifest}
    for (item, source, title_source), post in zip(documents, posts):
        assert item['slug'] == post['slug']
        collection = item["collection"]
        profile = converter.SOURCE / collection
        mapping = {(collection, k): v for k,v in json.loads((profile / "assets.json").read_text()).items()}
        # PDF wrappers use bare original figure filenames, whose aliases are in the profile.
        preview_source, has_preview_marker = prepare_preview_marker(source.replace('\n% BLOG-PART\n', '\n\n'), item["file"])
        linked, markers = prepare_references(preview_source, item, references)
        linked = expand_blog_post_links(linked, item["file"], slugs, exact_targets)
        fragment = restore_anchors(converter.convert_fragment(r"\section*{" + title_source + "}\n\n" + linked, collection, mapping, pandoc), markers)
        fragment = fragment.replace('href="https://codezen1729.github.io/math-blog/#/post/', 'href="#/post/')
        # The page template supplies the single h1. The source's outer section
        # is authoritative metadata and must not be repeated inside the article.
        first_heading = re.match(r'\s*<h1\b[^>]*>(.*?)</h1>', fragment, flags=re.S)
        if not first_heading:
            raise ValueError(f"The post title could not be rendered in {item['file']}")
        title = html.unescape(re.sub(r'<[^>]+>', '', first_heading[1]))
        title = re.sub(r'\s+', ' ', title).strip()
        if not title:
            raise ValueError(f"The rendered post title is blank in {item['file']}")
        item['title'] = title
        fragment = normalize_heading_hierarchy(fragment[first_heading.end():].lstrip())
        # The page supplies h1. Pandoc's remaining h2/h3/h4 hierarchy is
        # already subordinate and should not be shifted into skipped levels.
        fragment, marked_excerpt = split_rendered_preview(fragment, item["file"])
        if has_preview_marker and marked_excerpt is None:
            raise ValueError(f"{item['file']}: \\BlogPreviewEnd disappeared during conversion")
        plain = html.unescape(re.sub(r"<[^>]+>", " ", fragment))
        count = len(re.findall(r"\b[\w'-]+\b", plain))
        excerpt = marked_excerpt if marked_excerpt is not None else opening_excerpt(fragment)
        profile_macros = json.loads((profile / 'macros.json').read_text())
        post.update(
            title=title,
            html=fragment,
            excerptHtml=excerpt,
            _previewBlockCount=len(_top_level_blocks(marked_excerpt)) if marked_excerpt is not None else None,
            wordCount=count,
            minutes=max(1, math.ceil(count / 210)),
            mathMacros={**profile_macros, **SHARED_MATH_MACROS},
            editedSourceSha256=hashlib.sha256(source.encode()).hexdigest(),
        )
        print(f"Compiled: {title}", flush=True)
    link_numbered_references(posts, manifest)
    for post in posts:
        # Hash routes and in-document fragments share one browser URL slot.
        # Use a query target so citations work with refresh, Back and new tabs.
        post['html'] = re.sub(r'href="#(?!/)([^"]+)"', lambda m: 'href="#/post/' + post['slug'] + '?ref=' + quote(html.unescape(m[1]), safe='') + '"', post['html'])
    # Reference linking can also affect the opening excerpt.
    for post in posts:
        marked_blocks = post.pop('_previewBlockCount', None)
        post['excerptHtml'] = (
            "".join(_top_level_blocks(post['html'])[:marked_blocks])
            if marked_blocks is not None else opening_excerpt(post['html'])
        )
    (site / "lib/generated-posts.json").write_text(json.dumps(posts, ensure_ascii=False, indent=2) + "\n")
    post_dir = site / "lib/posts"
    post_dir.mkdir(parents=True, exist_ok=True)
    for stale in post_dir.glob("*.json"):
        stale.unlink()
    index_posts = []
    search_posts = []
    for post in posts:
        (post_dir / f"{post['slug']}.json").write_text(json.dumps(post, ensure_ascii=False, indent=2) + "\n")
        # The archive page needs only these fields.  Source/audit metadata and
        # complete article bodies remain in the per-post lazy modules.
        index_fields = {
            "order", "slug", "title", "excerptHtml", "phase", "phaseLabel",
            "track", "minutes", "prerequisites", "background",
        }
        index_posts.append({key: post[key] for key in index_fields if key in post})
        headings = [plain_text(value) for value in re.findall(r"<h[2-4]\b[^>]*>(.*?)</h[2-4]>", post["html"], flags=re.S | re.I)]
        theorem_names = [plain_text(value) for value in re.findall(r"<(?:div|p)\b[^>]*class=\"[^\"]*(?:theorem|lemma|proposition|corollary|definition|claim|example)[^\"]*\"[^>]*>(.*?)</(?:div|p)>", post["html"], flags=re.S | re.I)]
        search_posts.append({
            "slug": post["slug"], "title": post["title"], "series": post["phaseLabel"],
            "headings": headings, "theoremNames": theorem_names,
            "text": plain_text(post["html"]),
        })
    (site / "lib/generated-post-index.json").write_text(json.dumps(index_posts, ensure_ascii=False, indent=2) + "\n")
    (site / "public/search-index.json").write_text(json.dumps(search_posts, ensure_ascii=False, separators=(",", ":")) + "\n")
    original_descriptions = archived_figure_descriptions(baseline_posts)
    figure_descriptions: dict[str, str] = {}
    for post in posts:
        current_heading = post["title"]
        for token in re.findall(r"<h[2-4]\b[^>]*>.*?</h[2-4]>|<figure\b[^>]*>.*?</figure>|<img\b[^>]*>", post["html"], flags=re.S | re.I):
            if re.match(r"<h[2-4]\b", token, flags=re.I):
                current_heading = plain_text(token) or post["title"]
                continue
            for image in re.findall(r"<img\b[^>]*>", token, flags=re.S | re.I):
                src_match = re.search(r'src="([^"]+)"', image)
                if not src_match:
                    continue
                src = html.unescape(src_match.group(1))
                alt_match = re.search(r'alt="([^"]*)"', image)
                authored_alt = html.unescape(alt_match.group(1)).strip() if alt_match else ""
                caption_match = re.search(r"<figcaption\b[^>]*>(.*?)</figcaption>", token, flags=re.S | re.I)
                caption = plain_text(caption_match.group(1)) if caption_match else ""
                description = authored_alt or caption or original_descriptions.get(src, "")
                if not description or re.fullmatch(r"(?:image|figure)(?:\s+\w+)?", description, flags=re.I):
                    description = f"Mathematical diagram accompanying {current_heading} in {post['title']}."
                figure_descriptions.setdefault(src, description)
    (site / "lib/figure-descriptions.json").write_text(json.dumps(figure_descriptions, ensure_ascii=False, indent=2) + "\n")
    metadata = json.loads((site / "lib/figure-metadata.json").read_text())
    for post in posts:
        for name in re.findall(r'src="([^"]+\.svg)"', post["html"]):
            if name in metadata:
                continue
            path = site / "public" / name
            svg = ET.fromstring(path.read_text())
            _, _, width, height = map(float, svg.attrib["viewBox"].split())
            metadata[name] = {"kind":"vector", "width":round(width * 96/72), "height":round(height * 96/72), "displayWidth":round(width * 96/72 * 1.28), "labelSizePx":17}
    (site / "lib/figure-metadata.json").write_text(json.dumps(metadata, indent=2) + "\n")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--site", type=Path, required=True)
    args = parser.parse_args()
    render(args.project.resolve(), args.site.resolve())
