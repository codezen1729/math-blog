"""Verify independent Overleaf documents before publishing their website form."""
from concurrent.futures import ThreadPoolExecutor
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

def check(project: Path, output: Path):
    output.mkdir(parents=True, exist_ok=True)
    published = json.loads((project / "tools/manifest.json").read_text())
    published_by_file = {item["file"]: item for item in published}
    source_paths = sorted(project.glob("[0-9][0-9]-*.tex"))
    files = [published_by_file.get(path.name, {"file": path.name}) for path in source_paths]
    if not source_paths:
        raise RuntimeError("No numbered blog-post sources were found")
    for path in source_paths:
        if r"\input{styles/blog-preamble.tex}" not in path.read_text():
            raise RuntimeError(f"{path.name}: the shared blog preamble is missing")
    latex, bibtex = shutil.which("pdflatex"), shutil.which("bibtex")
    if not latex or not bibtex:
        raise RuntimeError("pdfLaTeX and BibTeX are required")
    def run(item):
        filename = item["file"]
        stem = Path(filename).stem
        directory = output / stem
        directory.mkdir(exist_ok=True)
        environment = {**os.environ, "openin_any":"p", "openout_any":"p", "BIBINPUTS":str(project) + "/:"}
        command = [latex, "-no-shell-escape", "-interaction=nonstopmode", "-halt-on-error", f"-output-directory={directory}", filename]
        def execute(args, cwd):
            result = subprocess.run(args, cwd=cwd, env=environment, capture_output=True, text=True, errors="replace", timeout=90)
            if result.returncode:
                raise RuntimeError(f"{filename}: compilation failed\n{result.stdout[-2400:]}\n{result.stderr[-400:]}")
        execute(command, project)
        if r"\bibdata" in (directory / f"{stem}.aux").read_text():
            execute([bibtex, stem], directory)
        execute(command, project)
        execute(command, project)
        log = (directory / f"{stem}.log").read_text(errors="replace")
        if "There were undefined references" in log or "undefined on input line" in log:
            raise RuntimeError(f"{filename}: unresolved references or citations")
        print(f"PDF checked: {filename}", flush=True)
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(run, files))

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    project = Path(__file__).resolve().parents[1]
    if args.output:
        check(project, args.output.resolve())
    else:
        with tempfile.TemporaryDirectory(prefix="blog-pdfs-") as folder:
            check(project, Path(folder))
