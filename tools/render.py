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

def render(project: Path, site: Path):
    manifest = json.loads((project / "tools/manifest.json").read_text())
    posts = json.loads((project / "tools/baseline-posts.json").read_text())
    assert len(manifest) == len(posts) and len(posts) >= 28
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
        documents.append((item, source))
    references = reference_index(documents)
    for (item, source), post in zip(documents, posts):
        assert item['slug'] == post['slug']
        collection = item["collection"]
        profile = converter.SOURCE / collection
        mapping = {(collection, k): v for k,v in json.loads((profile / "assets.json").read_text()).items()}
        # PDF wrappers use bare original figure filenames, whose aliases are in the profile.
        linked, markers = prepare_references(source.replace('\n% BLOG-PART\n', '\n\n'), item, references)
        fragment = restore_anchors(converter.convert_fragment(linked, collection, mapping, pandoc), markers)
        fragment = fragment.replace('href="https://codezen1729.github.io/math-blog/#/post/', 'href="#/post/')
        # The page template supplies the single h1. Keep source section titles
        # as internal headings, without repeating the article's own title.
        first_heading = re.match(r'\s*<h1\b[^>]*>(.*?)</h1>', fragment, flags=re.S)
        if first_heading:
            title = html.unescape(re.sub(r'<[^>]+>', '', first_heading[1])).strip()
            normalize = lambda value: re.sub(r'[^\w]+', '', value.lower())
            if normalize(title) == normalize(item['title']):
                fragment = fragment[first_heading.end():].lstrip()
        fragment = re.sub(r'<(/?)h([1-5])\b', lambda m: '<' + m[1] + 'h' + str(int(m[2])+1), fragment)
        plain = html.unescape(re.sub(r"<[^>]+>", " ", fragment))
        count = len(re.findall(r"\b[\w'-]+\b", plain))
        paragraphs = re.findall(r"<p>.*?</p>", fragment, flags=re.S)
        excerpt = next((p for p in paragraphs if 90 <= len(re.sub(r"<[^>]+>", "", p)) <= 700 and "<img" not in p and "footnote" not in p), "")
        post.update(html=fragment, excerptHtml=excerpt, wordCount=count, minutes=max(1,math.ceil(count / 210)), mathMacros=json.loads((profile / 'macros.json').read_text()), editedSourceSha256=hashlib.sha256(source.encode()).hexdigest())
        print(f"Compiled: {item['title']}", flush=True)
    link_numbered_references(posts, manifest)
    for post in posts:
        # Hash routes and in-document fragments share one browser URL slot.
        # Use a query target so citations work with refresh, Back and new tabs.
        post['html'] = re.sub(r'href="#(?!/)([^"]+)"', lambda m: 'href="#/post/' + post['slug'] + '?ref=' + quote(html.unescape(m[1]), safe='') + '"', post['html'])
    # Reference linking can also affect the opening excerpt.
    for post in posts:
        paragraphs = re.findall(r'<p>.*?</p>', post['html'], flags=re.S)
        post['excerptHtml'] = next((p for p in paragraphs if 90 <= len(re.sub(r'<[^>]+>', '', p)) <= 700 and '<img' not in p and 'footnote' not in p), '')
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
