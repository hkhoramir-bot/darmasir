#!/usr/bin/env python3
"""Derive PWA PNG icons (192/512) from the clean logo.
White background, logo at 76% (maskable safe zone)."""
import cairosvg, io
from PIL import Image

for size in (512, 192):
    scale = 0.76
    inner = int(size * scale)
    png = cairosvg.svg2png(url="public/metrojo-logo.svg",
                           output_width=inner, output_height=inner)
    logo = Image.open(io.BytesIO(png)).convert("RGBA")
    canvas = Image.new("RGB", (size, size), "#ffffff")
    off = (size - inner) // 2
    canvas.paste(logo, (off, off), logo)
    out = f"public/logo-icon-{size}.png"
    canvas.save(out, "PNG", optimize=True)
    print("wrote", out, canvas.size)
