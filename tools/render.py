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
import latex_to_web as converter

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
    for item, post in zip(manifest, posts):
        assert item["slug"] == post["slug"]
        file = project / item["file"]
        assert file.parent == project and file.suffix == ".tex"
        document = file.read_text()
        assert document.count("% BLOG-CONTENT-BEGIN") == document.count("% BLOG-CONTENT-END") == 1, f"Keep the blog content markers in {file.name}"
        source = document.split("% BLOG-CONTENT-BEGIN\n", 1)[1].split("% BLOG-CONTENT-END", 1)[0]
        collection = item["collection"]
        profile = converter.SOURCE / collection
        mapping = {(collection, k): v for k,v in json.loads((profile / "assets.json").read_text()).items()}
        # PDF wrappers use bare original figure filenames, whose aliases are in the profile.
        fragments = [converter.convert_fragment(part, collection, mapping, pandoc) for part in source.split("\n% BLOG-PART\n")]
        fragment = "\n".join(fragments)
        plain = html.unescape(re.sub(r"<[^>]+>", " ", fragment))
        count = len(re.findall(r"\b[\w'-]+\b", plain))
        paragraphs = re.findall(r"<p>.*?</p>", fragment, flags=re.S)
        excerpt = next((p for p in paragraphs if 90 <= len(re.sub(r"<[^>]+>", "", p)) <= 700 and "<img" not in p and "footnote" not in p), "")
        post.update(html=fragment, excerptHtml=excerpt, wordCount=count, minutes=max(1,math.ceil(count / 210)), editedSourceSha256=hashlib.sha256(source.encode()).hexdigest())
        print(f"Compiled: {item['title']}", flush=True)
    (site / "lib/generated-posts.json").write_text(json.dumps(posts, ensure_ascii=False, indent=2) + "\n")
    metadata = json.loads((site / "lib/figure-metadata.json").read_text())
    for post in posts:
        for name in re.findall(r'src="([^"]+\.svg)"', post["html"]):
            if name in metadata:
                continue
            path = site / "public" / name
            svg = ET.fromstring(path.read_text())
            _, _, width, height = map(float, svg.attrib["viewBox"].split())
            metadata[name] = {"kind":"vector", "width":round(width * 96/72), "height":round(height * 96/72), "displayWidth":min(640, round(width * 96/72))}
    (site / "lib/figure-metadata.json").write_text(json.dumps(metadata, indent=2) + "\n")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--site", type=Path, required=True)
    args = parser.parse_args()
    render(args.project.resolve(), args.site.resolve())
