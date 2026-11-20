#!/usr/bin/env python3
"""Rebuild the clean Metrojo logo from the uploaded vector.
Pipeline: parse M/L/Z path -> validate pairing -> bbox -> square centering
-> compact single-path evenodd SVG with brand gradient -> PWA PNG icons.
"""
import re, math, sys

SRC = "upload/logo-clean-vector.svg"
OUT_SVG = "public/metrojo-logo.svg"

GRAD = [("#22C79A", "0%"), ("#0FA37C", "55%"), ("#07805F", "100%")]

txt = open(SRC, encoding="utf-8").read()
m = re.search(r'\bd="([^"]+)"', txt, re.S)
d = m.group(1)

# ---- tokenize: commands M/L/Z with absolute coordinates ----
tokens = re.findall(r"([MLZ])|(-?\d*\.?\d+)", d)
cmds = []
i = 0
cur = None
coords = []
while i < len(tokens):
    cmd, num = tokens[i]
    if cmd:
        if cur:
            cmds.append((cur, coords))
        cur = cmd
        coords = []
    else:
        coords.append(float(num))
    i += 1
if cur:
    cmds.append((cur, coords))

# ---- validate: M/L need 2 coords, Z needs 0 ----
ok = True
for c, cs in cmds:
    if c == "Z" and len(cs) != 0:
        ok = False; print("BAD Z:", cs)
    if c in "ML" and len(cs) % 2 != 0:
        ok = False; print("BAD", c, "odd coords:", cs)
print("commands:", len(cmds), "M:", sum(1 for c,_ in cmds if c=='M'),
      "L:", sum(1 for c,_ in cmds if c=='L'),
      "Z:", sum(1 for c,_ in cmds if c=='Z'), "valid:", ok)
if not ok:
    sys.exit(1)

# ---- bbox ----
xs, ys = [], []
for c, cs in cmds:
    if c in "ML":
        xs.extend(cs[0::2]); ys.extend(cs[1::2])
minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
print("bbox:", minx, miny, maxx, maxy, "w:", maxx-minx, "h:", maxy-miny)

# ---- square-center into 1024 canvas with padding ----
SIZE = 1024
PAD = 92
w, h = maxx - minx, maxy - miny
scale = (SIZE - 2 * PAD) / max(w, h)
ox = (SIZE - w * scale) / 2 - minx * scale
oy = (SIZE - h * scale) / 2 - miny * scale

def fmt(v):
    s = f"{v:.1f}"
    return s[:-2] if s.endswith(".0") else s

parts = []
for c, cs in cmds:
    if c == "Z":
        parts.append("Z")
    elif c == "M":
        parts.append(f"M {fmt(cs[0]*scale+ox)},{fmt(cs[1]*scale+oy)}")
    else:
        parts.append(f"L {fmt(cs[0]*scale+ox)},{fmt(cs[1]*scale+oy)}")
new_d = " ".join(parts)

stops = "".join(
    f'\n    <stop offset="{off}" stop-color="{col}"/>' for col, off in GRAD
)
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <title>متروجو</title>
  <defs>
    <linearGradient id="mj" x1="0" y1="0" x2="1" y2="1">{stops}
    </linearGradient>
  </defs>
  <path fill="url(#mj)" fill-rule="evenodd" clip-rule="evenodd" d="{new_d}"/>
</svg>
'''
open(OUT_SVG, "w", encoding="utf-8").write(svg)
print("wrote", OUT_SVG, len(svg.encode()), "bytes")

# ---- render check: bbox of rendered pixels ----
import cairosvg
from PIL import Image
import io
png = cairosvg.svg2png(url=OUT_SVG, output_width=256, output_height=256)
img = Image.open(io.BytesIO(png)).convert("RGBA")
bbox = img.getbbox()
print("rendered bbox:", bbox, "canvas:", img.size)
assert bbox and bbox[2] - bbox[0] > 100 and bbox[3] - bbox[1] > 100, "render too small!"
print("RENDER OK")
