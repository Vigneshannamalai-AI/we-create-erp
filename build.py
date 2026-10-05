#!/usr/bin/env python3
"""Bundle src/ into one self-contained HTML file.

    python3 build.py          -> dist/we-create-erp.html  (open it by double-clicking) and docs/index.html (website)
    python3 build.py --test   -> also dist/test.html       (runs the automated checks)
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src"
DIST = ROOT / "dist"


def bundle(extra_js: str = "", runner: str = "boot();") -> str:
    html = (SRC / "index.html").read_text(encoding="utf-8")
    css = (SRC / "styles.css").read_text(encoding="utf-8")
    html = html.replace('<link rel="stylesheet" href="styles.css"><!--CSS-->', f"<style>\n{css}\n</style>")

    def inline(match: re.Match) -> str:
        js = (SRC / match.group(1)).read_text(encoding="utf-8")
        assert "</script" not in js, f"{match.group(1)} contains </script>"
        return f"<script>/* {match.group(1)} */\n{js}\n</script>"

    html = re.sub(r'<script src="(js/[\w.]+)"></script>', inline, html)
    html = html.replace("<script>boot();</script>", f"{extra_js}<script>{runner}</script>")
    return html


def main() -> None:
    DIST.mkdir(exist_ok=True)
    out = DIST / "we-create-erp.html"
    out.write_text(bundle(), encoding="utf-8")
    print(f"built {out} ({out.stat().st_size // 1024} KB)")
    # docs/ is what GitHub Pages serves: https://vigneshannamalai-ai.github.io/we-create-erp/
    site = ROOT / "docs"
    site.mkdir(exist_ok=True)
    (site / "index.html").write_text(bundle(), encoding="utf-8")
    (site / ".nojekyll").write_text("", encoding="utf-8")
    print(f"built {site / 'index.html'} (GitHub Pages)")
    if "--test" in sys.argv:
        tests = (ROOT / "tests" / "tests.js").read_text(encoding="utf-8")
        t = DIST / "test.html"
        t.write_text(bundle(f"<script>/* tests.js */\n{tests}\n</script>", "runTests();"), encoding="utf-8")
        print(f"built {t}")


if __name__ == "__main__":
    main()
