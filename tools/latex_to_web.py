"""Published-essay LaTeX conversion helpers."""
import html, hashlib, json, os, re, shutil, subprocess, sys, tempfile
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "tools/profiles"

def unwrap_layout_commands(text: str) -> str:
    """Remove presentation boxes, never the argument/conclusion inside them."""
    pattern = re.compile(r"\\(?:fbox|centerline)\s*\{")
    while match := pattern.search(text):
        depth, cursor = 1, match.end()
        while cursor < len(text) and depth:
            if text[cursor] == "{" and text[cursor - 1] != "\\": depth += 1
            if text[cursor] == "}" and text[cursor - 1] != "\\": depth -= 1
            cursor += 1
        if depth:
            raise ValueError("Unbalanced layout command in source excerpt")
        text = text[:match.start()] + "\n" + text[match.end():cursor - 1] + "\n" + text[cursor:]
    return text


def clean_tex(text: str) -> str:
    text = unwrap_layout_commands(text)
    text = re.sub(r"(?m)^\s*%.*$", "", text)
    # Preserve the one prose use of this math-only command in the bundle source.
    text = text.replace(r"\text{replacing points }", "replacing points ")
    text = text.replace("\\cross", "\\times")
    # Browser-typesetting compatibility only: keep all mathematical symbols and
    # footnote words, without changing a claim or filling an unfinished argument.
    text = text.replace(r"\big{|_\mathbb{D}}", r"\big|_{\mathbb{D}}")
    text = re.sub(r"\\tag\{([^{}]*)\}", lambda m: r"\tag{" + m.group(1).replace(r"\dagger", "†") + "}", text)
    text = re.sub(r"\\begin\{cases\*\}(.*?)\\end\{cases\*\}", lambda m: r"\begin{cases}" + m.group(1).replace("& if $", r"& \text{if } ").replace("$", "") + r"\end{cases}", text, flags=re.S)
    def move_display_footnotes(match: re.Match[str]) -> str:
        notes = re.findall(r"\\footnote\{([^{}]*)\}", match[1])
        body = re.sub(r"\\footnote\{[^{}]*\}", "", match[1])
        return "$$" + body + "$$" + "".join(r"\footnote{" + note + "}" for note in notes)
    text = re.sub(r"\$\$(.*?)\$\$", move_display_footnotes, text, flags=re.S)
    text = re.sub(r"\\begin\{equation\*?\}\s*(\\includegraphics\{[^}]+\})\s*(?:\\tag\{([^{}]+)\})?\s*\\end\{equation\*?\}", lambda m: m.group(1) + ("\n$(" + m.group(2) + ")$" if m.group(2) else ""), text)
    text = re.sub(r"\\begin\{tool\}\{([^}]*)\}\{([^}]*)\}", r"\\subsection*{Tool \1 — \2}", text)
    text = text.replace("\\end{tool}", "")
    text = re.sub(r"\\Result\{([^{}]*)\}", r"\\subsection*{\1}", text)
    text = re.sub(r"\\Application\{([^{}]*)\}", lambda m: r"\subsubsection*{Application" + (" — " + m.group(1) if m.group(1).strip() else "") + "}", text)
    text = re.sub(r"\\ToolRef\{([^{}]*)\}", r"Tool \1", text)
    text = re.sub(r"\\ProofOf\{([^{}]*)\}", r"\\textit{Proof of \1.}", text)
    text = text.replace("\\ProofHeading", "\\textit{Proof.}")
    text = text.replace("\\RemarkHeading", "\\textbf{Remark.}")
    text = text.replace("\\NoteHeading", "\\textbf{Note.}")
    text = text.replace("\\ExerciseHeading", "\\textbf{Exercise.}")
    text = re.sub(r"\\ToolRef\{([^{}]*)\}", r"Tool \1", text)
    text = re.sub(r"\\FigureTag\{([^{}]*)\}\{([^{}]*)\}", r"\\textit{Figure \1}", text)
    text = re.sub(r"\\label\{[^{}]*\}", "", text)

    # Turn the custom theorem syntaxes used across the archive into semantic headings.
    theorem_names = {
        "theorem": "Theorem",
        "thm": "Theorem",
        "thmx": "Theorem",
        "lemma": "Lemma",
        "proposition": "Proposition",
        "prop": "Proposition",
        "corollary": "Corollary",
        "definition": "Definition",
        "defn": "Definition",
        "conjecture": "Conjecture",
        "example": "Example",
    }
    for environment, label in theorem_names.items():
        pattern = rf"\\begin\{{{environment}\}}(?:\[([^]]*)\]|\{{([^{{}}]*)\}})?\s*:?-?"

        def theorem_repl(match: re.Match[str], theorem_label: str = label) -> str:
            title = (match.group(1) or match.group(2) or "").strip().strip("()")
            suffix = f" — {title}" if title else ""
            return f"\\subsection*{{{theorem_label}{suffix}}}"

        text = re.sub(pattern, theorem_repl, text)
        text = text.replace(f"\\end{{{environment}}}", "")

    text = re.sub(r"\\begin\{proof\}(?:\[[^]]*\])?", r"\\textit{Proof.}", text)
    text = text.replace("\\end{proof}", "")

    # Page-layout commands have no semantic role on the web.
    text = re.sub(r"\\(noindent|newpage|clearpage|medskip|bigskip|smallskip|FloatBarrier)\b", "", text)
    text = re.sub(r"\\vspace\*?\{[^{}]*\}", "", text)
    text = re.sub(r"\\Needspace\*?\{[^{}]*\}", "", text)
    text = re.sub(r"\\hspace\*?\{[^{}]*\}", " ", text)
    text = text.replace("\\hfill", "")
    text = re.sub(r"(?m)^\s*\\\\\s*$", "\n", text)
    text = re.sub(r"\n{4,}", "\n\n", text)
    return text.strip()


def sanitize_fragment(fragment: str) -> str:
    fragment = re.sub(r"<script\b.*?</script>", "", fragment, flags=re.I | re.S)
    fragment = re.sub(r"\s+on[a-z]+\s*=\s*(['\"]).*?\1", "", fragment, flags=re.I | re.S)
    fragment = re.sub(r"javascript:", "", fragment, flags=re.I)
    fragment = fragment.replace("<embed ", "<img ")
    return fragment


def asset_url_for(src: str, collection: str, asset_map: dict[tuple[str, str], str]) -> str | None:
    normalized = src.replace("\\", "/")
    candidates = [normalized, normalized.lstrip("./"), Path(normalized).name]
    for candidate in candidates:
        exact = asset_map.get((collection, candidate.lower()))
        if exact:
            return exact
    stem = Path(normalized).stem.lower()
    for (asset_collection, key), value in asset_map.items():
        if asset_collection == collection and Path(key).stem.lower() == stem:
            return value
    return None


def rewrite_assets(fragment: str, collection: str, asset_map: dict[tuple[str, str], str]) -> str:
    def replace_src(match: re.Match[str]) -> str:
        original = html.unescape(match.group(1))
        replacement = asset_url_for(original, collection, asset_map)
        if not replacement:
            return match.group(0)
        return f'src="{replacement}" loading="lazy"'

    return re.sub(r'src="([^"]+)"', replace_src, fragment)


def render_diagrams(text: str, collection: str) -> str:
    """Typeset the author's exact TikZ code as SVG; never replace a proof diagram with prose."""
    pattern = r"(?:\$\$|\\\[)?\s*(\\begin\{(tikzcd|tikzpicture)\}.*?\\end\{\2\})\s*(?:\$\$|\\\])?"

    def render(match: re.Match[str]) -> str:
        diagram = match.group(1)
        if r"\includegraphics" in diagram:
            # This source uses TikZ only to place two existing images side by side.
            # Preserve their order and original shared caption as responsive images.
            images = re.findall(r"\\includegraphics(?:\[[^]]*\])?\{([^}]+)\}", diagram)
            if len(images) == 2 and diagram.count(r"\node") == 2:
                return "\n" + "\n".join(r"\includegraphics[width=0.48\linewidth]{" + path + "}" for path in images) + "\n"
        digest = hashlib.sha256(diagram.encode()).hexdigest()[:16]
        relative = f"figures/{collection}/diagram-{digest}.svg"
        destination = ROOT / "public" / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        if not destination.exists() or "stroke=" not in destination.read_text(encoding="utf-8"):
            latex = shutil.which("latex") or "/Library/TeX/texbin/latex"
            dvisvgm = shutil.which("dvisvgm") or "/Library/TeX/texbin/dvisvgm"
            with tempfile.TemporaryDirectory(prefix="math-blog-diagram-") as temporary:
                directory = Path(temporary)
                wrapped = "$\\displaystyle " + diagram + "$" if match.group(2) == "tikzcd" else diagram
                document = r"\documentclass[dvisvgm,border=6pt]{standalone}" + "\n" + r"\def\pgfsysdriver{pgfsys-dvisvgm.def}" + "\n" + r"\usepackage{amsmath,amssymb,tikz,tikz-cd}" + "\n" + r"\usetikzlibrary{arrows.meta,calc,positioning,patterns,decorations.pathreplacing}" + "\n" + r"\newcommand{\cross}{\times}" + "\n" + r"\begin{document}" + "\n" + wrapped + "\n" + r"\end{document}"
                (directory / "diagram.tex").write_text(document, encoding="utf-8")
                environment = {**os.environ, "openin_any": "p", "openout_any": "p"}
                for command in ([latex, "-no-shell-escape", "-interaction=nonstopmode", "-halt-on-error", "diagram.tex"], [dvisvgm, "--no-fonts", "--exact", "--output=diagram.svg", "diagram.dvi"]):
                    result = subprocess.run(command, cwd=directory, env=environment, capture_output=True, text=True, timeout=90)
                    if result.returncode:
                        raise RuntimeError(f"Source diagram could not be typeset ({collection}, {digest}): {result.stdout[-1800:]} {result.stderr[-500:]}")
                shutil.copy2(directory / "diagram.svg", destination)
        return "\n\\includegraphics{" + relative + "}\n"

    return re.sub(pattern, render, text, flags=re.S)


def convert_fragment(text: str, collection: str, asset_map: dict[tuple[str, str], str], pandoc: str) -> str:
    if (SOURCE / collection / 'notes-format.json').exists():
        from notes_to_web import prepare
        text = prepare(text)
    cleaned = clean_tex(render_diagrams(text, collection))
    arguments = [pandoc, "--from=latex+raw_tex", "--to=html5", "--mathjax", "--wrap=none"]
    bibliographies = sorted((SOURCE / collection).glob("*.bib"))
    if bibliographies:
        arguments.extend(["--citeproc", "--metadata=reference-section-title:References"])
        for bibliography in bibliographies:
            arguments.extend(["--bibliography", str(bibliography)])
    completed = subprocess.run(arguments, input=cleaned, text=True, capture_output=True, check=True, timeout=90)
    fragment = sanitize_fragment(completed.stdout.strip())
    return rewrite_assets(fragment, collection, asset_map)
