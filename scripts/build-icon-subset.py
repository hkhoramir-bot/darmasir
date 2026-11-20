#!/usr/bin/env python3
"""Rebuild Material Symbols subset from the FULL font with the COMPLETE
icon inventory used by the app (static MI names + data-driven icon fields).

The v9 subset was built from a stale icon list: 33 ligatures were missing
(restart_alt, navigation, favorite, explore, share, ...) so the app rendered
raw ligature text like "RE*T_ALT" instead of icons.

Method:
  1. collect every icon name from src/**/*.{tsx,ts}
  2. resolve each icon's ligature glyph by HarfBuzz-shaping the FULL font
     (robust - follows every substitution chain exactly as the browser will)
  3. pyftsubset --glyphs=<icon glyphs> --text=<letters> --no-layout-closure
     (keeps GSUB rules only where all referenced glyphs survive)
  4. verify: shape every icon name in the NEW subset - each MUST collapse
     to exactly one icon glyph
"""
import re
import subprocess
import sys
from pathlib import Path

from fontTools.ttLib import TTFont
import uharfbuzz as hb

ROOT = Path(__file__).resolve().parent.parent
FULL = ROOT / "public/fonts/material-symbols-outlined.woff2"
OUT = ROOT / "public/fonts/material-symbols-subset.woff2"

STATIC_RX = re.compile(r'(?:MI\s+name|\bname|\bicon)\s*=\s*"([a-z_0-9]+)"')
# نام‌های شرطی داخل expression: name={cond ? "x" : "y"} یا icon={cond ? "x" : "y"}
EXPR_RX = re.compile(r'\b(?:name|icon)\s*=\s*\{([^}]*)\}')
STR_RX = re.compile(r'"([a-z_0-9]+)"')
DATA_RX = re.compile(r'\bicon:\s*"([a-z_0-9]+)"')


def collect_icons() -> list[str]:
    icons: set[str] = set()
    for path in list(ROOT.glob("src/**/*.tsx")) + list(ROOT.glob("src/**/*.ts")):
        src = path.read_text(encoding="utf-8")
        icons.update(STATIC_RX.findall(src))
        icons.update(DATA_RX.findall(src))
        for expr in EXPR_RX.findall(src):
            icons.update(STR_RX.findall(expr))
    return sorted(icons)


def shape_glyphs(font: hb.Font, glyph_order: list[str], text: str) -> list[str]:
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(font, buf)
    return [glyph_order[i] if i > 0 else ".notdef" for i in (g.codepoint for g in buf.glyph_infos)]


def resolve_ligature_glyphs(full_ttf: str, icons: list[str]) -> tuple[dict[str, str], list[str]]:
    """icon -> ligature glyph name, resolved by HarfBuzz shaping on the FULL font."""
    blob = hb.Blob.from_file_path(full_ttf)
    face = hb.Face(blob)
    font = hb.Font(face)
    order = TTFont(full_ttf).getGlyphOrder()
    mapping: dict[str, str] = {}
    no_lig: list[str] = []
    for ic in icons:
        glyphs = shape_glyphs(font, order, ic)
        if len(glyphs) == 1 and glyphs[0] != ".notdef":
            mapping[ic] = glyphs[0]
        else:
            no_lig.append(ic)
    return mapping, no_lig


def main() -> int:
    icons = collect_icons()
    print(f"icons used in app: {len(icons)}")

    # decompress full woff2 -> ttf for HarfBuzz
    full_ttf = "/tmp/_ms_full.ttf"
    full = TTFont(str(FULL))
    full.flavor = None
    full.save(full_ttf)
    glyph_names = set(full.getGlyphOrder())

    seqmap, no_lig = resolve_ligature_glyphs(full_ttf, icons)
    if no_lig:
        print("FATAL: icons without ligature in full font:", no_lig)
        return 1
    absent = [ic for ic in icons if seqmap[ic] not in glyph_names]
    if absent:
        print("FATAL: ligature glyphs absent from full font:", absent)
        return 1
    print("resolved ligature glyphs:", len(seqmap))

    glyph_args = ",".join(sorted(set(seqmap.values())))
    text_args = "".join(sorted({c for ic in icons for c in ic}))

    cmd = [
        "pyftsubset", str(FULL),
        f"--glyphs={glyph_args}",
        f"--text={text_args}",
        "--no-layout-closure",
        "--layout-features=liga,rlig,ccmp,mark,rclt",
        "--flavor=woff2",
        f"--output-file={OUT}",
    ]
    subprocess.run(cmd, check=True)

    print(f"subset written: {OUT.stat().st_size} bytes ({OUT.stat().st_size / 1024:.1f} KB)")

    # ---- verification: shape every icon name in the NEW subset ----
    check_ttf = "/tmp/_subset_check.ttf"
    sub = TTFont(str(OUT))
    sub.flavor = None
    sub.save(check_ttf)
    blob = hb.Blob.from_file_path(check_ttf)
    face = hb.Face(blob)
    font = hb.Font(face)
    order = TTFont(check_ttf).getGlyphOrder()

    bad = []
    for ic in icons:
        glyphs = shape_glyphs(font, order, ic)
        if len(glyphs) != 1 or glyphs[0] == ".notdef":
            bad.append((ic, glyphs[:6]))
    if bad:
        print("FATAL: broken ligatures after subsetting:", bad)
        return 1
    print(f"verified: all {len(icons)} icons shape to a single glyph - OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
