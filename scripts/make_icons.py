#!/usr/bin/env python3
"""生成 PWA 图标（绿色底 + 白色星形，全出血、无圆角，交由系统裁切）"""
from PIL import Image, ImageDraw
import math
from pathlib import Path

BG = (20, 107, 90)        # #146b5a
BG_DARK = (13, 77, 64)    # #0d4d40
FG = (255, 255, 255)


def star_points(cx, cy, outer, inner, points=5, rot=-90):
    pts = []
    for i in range(points * 2):
        r = outer if i % 2 == 0 else inner
        a = math.radians(rot + i * 180 / points)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def make_icon(size: int, path: Path):
    s = size / 512
    img = Image.new("RGB", (size, size), BG)
    d = ImageDraw.Draw(img)

    # 顶部轻微高光，让图标在深色模式下也层次分明
    for i in range(size):
        t = i / size
        if t < 0.55:
            continue
        ratio = (t - 0.55) / 0.45
        color = tuple(int(BG[j] + (BG_DARK[j] - BG[j]) * ratio) for j in range(3))
        d.line([(0, i), (size, i)], fill=color)

    # 星形：外描边 + 内填充，保证小尺寸也清晰
    pts = star_points(256 * s, 262 * s, 168 * s, 70 * s)
    d.polygon(pts, fill=FG)

    img.save(path, "PNG", optimize=True)
    print("wrote", path, img.size)


def main():
    out = Path(__file__).resolve().parent.parent / "icons"
    out.mkdir(exist_ok=True)
    make_icon(192, out / "icon-192.png")
    make_icon(512, out / "icon-512.png")
    make_icon(180, out / "apple-touch-icon.png")


if __name__ == "__main__":
    main()
