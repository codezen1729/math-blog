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
from pathlib import Path
from urllib.parse import quote
import latex_to_web as converter
from references import reference_index, prepare_references, restore_anchors, link_numbered_references


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


def expand_blog_post_links(text: str, filename: str, slugs: set[str]) -> str:
    """Validate and expand author-friendly links to another blog post."""
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


def opening_excerpt(fragment: str) -> str:
    """Return the first genuine prose paragraph, rather than a later teaser."""
    for paragraph in re.findall(r"<p(?:\s[^>]*)?>.*?</p>", fragment, flags=re.S):
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
        if (
            len(plain) >= 8
            and re.search(r"[A-Za-z]", plain)
            and not re.fullmatch(r"(?:proof|remark|note|example|definition|theorem)\.?", plain, flags=re.I)
            and len(navigation_parts) < 2
            and not roman_section_label
        ):
            return paragraph
    return ""

def render(project: Path, site: Path):
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
    slugs = {item["slug"] for item in manifest}
    for (item, source, title_source), post in zip(documents, posts):
        assert item['slug'] == post['slug']
        collection = item["collection"]
        profile = converter.SOURCE / collection
        mapping = {(collection, k): v for k,v in json.loads((profile / "assets.json").read_text()).items()}
        # PDF wrappers use bare original figure filenames, whose aliases are in the profile.
        linked, markers = prepare_references(source.replace('\n% BLOG-PART\n', '\n\n'), item, references)
        linked = expand_blog_post_links(linked, item["file"], slugs)
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
        fragment = fragment[first_heading.end():].lstrip()
        fragment = re.sub(r'<(/?)h([1-5])\b', lambda m: '<' + m[1] + 'h' + str(int(m[2])+1), fragment)
        plain = html.unescape(re.sub(r"<[^>]+>", " ", fragment))
        count = len(re.findall(r"\b[\w'-]+\b", plain))
        excerpt = opening_excerpt(fragment)
        profile_macros = json.loads((profile / 'macros.json').read_text())
        post.update(
            title=title,
            html=fragment,
            excerptHtml=excerpt,
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
        post['excerptHtml'] = opening_excerpt(post['html'])
    (site / "lib/generated-posts.json").write_text(json.dumps(posts, ensure_ascii=False, indent=2) + "\n")
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
