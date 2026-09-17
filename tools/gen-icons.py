#!/usr/bin/env python3
"""Draw the PWA icons and write the manifests, one pair per tab disguise.

    python3 tools/gen-icons.py

Writes /icons/<id>-192.png, -512.png, -maskable.png and
/manifest/<id>.webmanifest. Run it after changing PRESETS in js/mimicry.js,
then add the new id to HAVE_MANIFEST in js/pwa.js.

The Google app icons follow the May 2026 Workspace redesign: gradients instead
of flat fills, and no more four-colour rule. These are our own drawings of that
style, not Google's files.

Needs Pillow and numpy, neither of which the site itself uses.
"""
import json
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS = os.path.join(REPO, "icons")
MANIFESTS = os.path.join(REPO, "manifest")
S = 1024  # draw big, downsample to size

BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"


# ── Paint ───────────────────────────────────────────────────────────────────

def rgb(hex_color):
    h = hex_color.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=float)


def ramp(stops, t):
    """stops: [(position 0..1, '#rrggbb')]. t: array of positions."""
    out = np.zeros(t.shape + (3,), dtype=float)
    pos = [p for p, _ in stops]
    cols = [rgb(c) for _, c in stops]
    out[...] = cols[0]
    for i in range(len(stops) - 1):
        a, b = pos[i], pos[i + 1]
        k = np.clip((t - a) / max(b - a, 1e-6), 0, 1)
        seg = (t >= a)
        mix = cols[i] + (cols[i + 1] - cols[i]) * k[..., None]
        out = np.where(seg[..., None], mix, out)
    return out


def linear(stops, p0, p1):
    """Gradient along the p0 → p1 axis, both in 0..1 icon coordinates."""
    ys, xs = np.mgrid[0:S, 0:S] / float(S)
    ax, ay = p1[0] - p0[0], p1[1] - p0[1]
    denom = ax * ax + ay * ay
    t = np.clip(((xs - p0[0]) * ax + (ys - p0[1]) * ay) / denom, 0, 1)
    return ramp(stops, t)


def angular(stops, center):
    """Sweep gradient. t runs counter-clockwise from due east."""
    ys, xs = np.mgrid[0:S, 0:S] / float(S)
    ang = np.arctan2(center[1] - ys, xs - center[0])
    return ramp(stops, (ang % (2 * np.pi)) / (2 * np.pi))


def paint(mask, colors):
    """Put a colour array behind an L-mode mask."""
    img = np.zeros((S, S, 4), dtype=np.uint8)
    img[..., :3] = np.clip(colors, 0, 255).astype(np.uint8)
    img[..., 3] = np.asarray(mask, dtype=np.uint8)
    return Image.fromarray(img, "RGBA")


def mask_layer():
    m = Image.new("L", (S, S), 0)
    return m, ImageDraw.Draw(m)


def over(base, layer):
    base.alpha_composite(layer)
    return base


def blank():
    return Image.new("RGBA", (S, S), (0, 0, 0, 0))


def rounded_polygon(draw, points, radius, fill=255):
    """Polygon with the corners rounded off, drawn into an L mask."""
    pts = [np.array(p, dtype=float) for p in points]
    n = len(pts)
    path = []
    for i in range(n):
        prev, cur, nxt = pts[i - 1], pts[i], pts[(i + 1) % n]
        v1, v2 = prev - cur, nxt - cur
        l1, l2 = np.linalg.norm(v1), np.linalg.norm(v2)
        r = min(radius, l1 / 2, l2 / 2)
        u1, u2 = v1 / l1, v2 / l2
        a, b = cur + u1 * r, cur + u2 * r
        # Quadratic bend through the corner.
        for k in range(13):
            t = k / 12.0
            path.append(tuple((1 - t) ** 2 * a + 2 * (1 - t) * t * cur + t ** 2 * b))
    draw.polygon(path, fill=fill)


# ── Google Workspace, May 2026 ──────────────────────────────────────────────

PAGE = (0.21, 0.06, 0.79, 0.94)   # x0, y0, x1, y1 of a document sheet
FOLD = 0.21                       # size of the folded corner


def sheet_masks():
    """The document silhouette and its folded corner, as two masks."""
    x0, y0, x1, y1 = (v * S for v in PAGE)
    cut = FOLD * S
    body, d = mask_layer()
    rounded_polygon(d, [(x0, y0), (x1 - cut, y0), (x1, y0 + cut), (x1, y1), (x0, y1)], S * 0.045)
    fold, fd = mask_layer()
    rounded_polygon(fd, [(x1 - cut, y0), (x1, y0 + cut), (x1 - cut, y0 + cut)], S * 0.03)
    return body, fold


def docs():
    body, fold = sheet_masks()
    img = paint(body, linear(
        [(0.0, "#3186ff"), (0.55, "#3186ff"), (0.82, "#7b82ff"), (1.0, "#b08cf5")],
        (0.75, 0.05), (0.25, 1.0)))
    img = over(img, paint(fold, linear([(0, "#76bbff"), (1, "#76bbff")], (0, 0), (1, 1))))

    bars, d = mask_layer()
    x0, y0, x1, y1 = (v * S for v in PAGE)
    w = (x1 - x0)
    h = S * 0.042
    for width, cy in ((0.60, 0.60), (0.40, 0.73)):
        bx = x0 + (w - w * width) / 2
        by = y0 + (y1 - y0) * cy
        d.rounded_rectangle([bx, by - h / 2, bx + w * width, by + h / 2], radius=h / 2, fill=255)
    white = np.full((S, S, 3), 255.0)
    return over(img, paint(bars, white))


def drive():
    """Three rounded petals, no red, hollow middle."""
    cx, cy = 0.5 * S, 0.56 * S
    outer = [(cx, 0.11 * S), (0.95 * S, 0.86 * S), (0.05 * S, 0.86 * S)]
    inner = [(cx, 0.545 * S), (0.655 * S, 0.775 * S), (0.345 * S, 0.775 * S)]
    shell, d = mask_layer()
    rounded_polygon(d, outer, S * 0.22)
    hole, hd = mask_layer()
    rounded_polygon(hd, inner, S * 0.07)
    ring = Image.fromarray(np.clip(np.asarray(shell, float) - np.asarray(hole, float), 0, 255).astype(np.uint8), "L")
    colors = angular(
        [(0.00, "#ffc500"), (0.17, "#7cc73c"), (0.23, "#12b45f"), (0.44, "#12b45f"),
         (0.52, "#2f9fd0"), (0.58, "#3186ff"), (0.78, "#3186ff"), (0.86, "#c0c62f"),
         (0.92, "#ffc500"), (1.00, "#ffc500")],
        (0.5, cy / S))
    return paint(ring, colors)


def card(box, radius, colors, rotate=0.0):
    """A rounded card, optionally tilted."""
    m, d = mask_layer()
    d.rounded_rectangle([v * S for v in box], radius=radius * S, fill=255)
    layer = paint(m, colors)
    return layer.rotate(rotate, resample=Image.BICUBIC, center=(S / 2, S / 2)) if rotate else layer


def sheets():
    back = card((0.14, 0.26, 0.74, 0.74), 0.07,
                linear([(0, "#6ee7a8"), (1, "#6ee7a8")], (0, 0), (1, 1)))
    back.putalpha(back.getchannel("A").point(lambda v: int(v * 0.55)))
    front = card((0.19, 0.24, 0.86, 0.76), 0.075,
                 linear([(0.0, "#0a9b52"), (0.45, "#17b45f"), (1.0, "#2ad06e")],
                        (0.15, 0.3), (0.95, 0.85)))
    img = over(over(blank(), back), front)

    cross, d = mask_layer()
    w = S * 0.058
    d.rounded_rectangle([0.515 * S - w / 2, 0.30 * S, 0.515 * S + w / 2, 0.70 * S], radius=w / 2, fill=255)
    d.rounded_rectangle([0.32 * S, 0.50 * S - w / 2, 0.81 * S, 0.50 * S + w / 2], radius=w / 2, fill=255)
    return over(img, paint(cross, np.full((S, S, 3), 255.0)))


def slides():
    back = card((0.21, 0.21, 0.88, 0.71), 0.07,
                linear([(0, "#ffd75e"), (1, "#ffd75e")], (0, 0), (1, 1)), rotate=-8)
    back.putalpha(back.getchannel("A").point(lambda v: int(v * 0.8)))
    front = card((0.15, 0.27, 0.83, 0.77), 0.07,
                 linear([(0.0, "#ff5f86"), (0.16, "#ff9a3d"), (0.34, "#ffc400"), (1.0, "#ffc400")],
                        (0.10, 0.98), (0.58, 0.40)))
    img = over(over(blank(), back), front)

    frame, d = mask_layer()
    d.rounded_rectangle([0.29 * S, 0.39 * S, 0.70 * S, 0.65 * S], radius=S * 0.025,
                        outline=255, width=int(S * 0.05))
    return over(img, paint(frame, np.full((S, S, 3), 255.0)))


def gmail():
    """The M on its own, swept from pink through red to blue and green."""
    x0, x1 = 0.09 * S, 0.91 * S
    top, bot = 0.28 * S, 0.74 * S
    w = 0.165 * S
    m, d = mask_layer()
    rounded_polygon(d, [
        (x0, bot), (x0, top), (0.5 * S, 0.545 * S), (x1, top), (x1, bot),
        (x1 - w, bot), (x1 - w, top + 0.115 * S), (0.5 * S, 0.70 * S),
        (x0 + w, top + 0.115 * S), (x0 + w, bot),
    ], S * 0.035)
    colors = linear(
        [(0.0, "#ff3b76"), (0.22, "#f5443c"), (0.52, "#f5443c"), (0.72, "#3186ff"), (1.0, "#16c46a")],
        (0.08, 0.85), (0.92, 0.18))
    return paint(m, colors)


def google():
    """The gradient G that replaced the four segments in 2025."""
    cx, cy, r, thick = 0.5, 0.5, 0.335, 0.115
    ring, d = mask_layer()
    d.ellipse([(cx - r) * S, (cy - r) * S, (cx + r) * S, (cy + r) * S], fill=255)
    d.ellipse([(cx - r + thick) * S, (cy - r + thick) * S,
               (cx + r - thick) * S, (cy + r - thick) * S], fill=0)
    # Open the mouth, then lay the crossbar in.
    d.polygon([(cx * S, cy * S), (S, (cy - 0.24) * S), (S, (cy + 0.02) * S)], fill=0)
    d.rounded_rectangle([(cx + 0.02) * S, (cy - 0.058) * S, (cx + r) * S, (cy + 0.058) * S],
                        radius=S * 0.02, fill=255)
    colors = angular(
        [(0.00, "#4285f4"), (0.13, "#5b6ef0"), (0.27, "#ea4335"), (0.42, "#f5871f"),
         (0.55, "#fbbc05"), (0.72, "#34a853"), (0.88, "#1aa5c8"), (1.00, "#4285f4")],
        (cx, cy))
    return paint(ring, colors)


# ── Everything else ─────────────────────────────────────────────────────────

def font(px):
    return ImageFont.truetype(BOLD, px)


def plate(color, radius=0.22):
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * radius), fill=color)
    return img, d


def solid_letter(bg, text, fg="white", px=0.46, radius=0.22):
    img, d = plate(bg, radius=radius)
    d.text((S / 2, S / 2), text, font=font(int(S * px)), fill=fg, anchor="mm")
    return img


def classroom():
    """Untouched by the 2026 redesign — still the green board."""
    img, d = plate("#0f9d58")
    d.rectangle([S * 0.22, S * 0.30, S * 0.78, S * 0.70], fill="white")
    d.ellipse([S * 0.44, S * 0.36, S * 0.56, S * 0.48], fill="#0f9d58")
    d.polygon([(S * 0.36, S * 0.64), (S * 0.42, S * 0.52), (S * 0.58, S * 0.52), (S * 0.64, S * 0.64)], fill="#0f9d58")
    return img


def khan():
    img, d = plate("#14bf96", radius=0.50)
    d.ellipse([S * 0.24, S * 0.24, S * 0.76, S * 0.76], outline="white", width=int(S * 0.08))
    d.ellipse([S * 0.42, S * 0.42, S * 0.58, S * 0.58], fill="white")
    return img


def desmos():
    img, d = plate("white", radius=0.22)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), outline="#e0e0e0", width=int(S * 0.02))
    pts = [(S * (0.14 + 0.72 * i / 40), S * (0.72 - 0.44 * (i / 40) ** 2)) for i in range(41)]
    d.line(pts, fill="#2d70b3", width=int(S * 0.09), joint="curve")
    d.line([S * 0.14, S * 0.84, S * 0.86, S * 0.84], fill="#c9c9c9", width=int(S * 0.04))
    d.line([S * 0.16, S * 0.14, S * 0.16, S * 0.86], fill="#c9c9c9", width=int(S * 0.04))
    return img


PRESETS = [
    # id, short_name, name, theme colour, drawing
    ("gamevault", "GameVault", "GameVault", "#08080a", lambda: solid_letter("#ff3b3b", "GV", px=0.40)),
    ("docs", "Docs", "Google Docs", "#ffffff", docs),
    ("drive", "Drive", "Google Drive", "#ffffff", drive),
    ("sheets", "Sheets", "Google Sheets", "#ffffff", sheets),
    ("slides", "Slides", "Google Slides", "#ffffff", slides),
    ("gmail", "Gmail", "Gmail", "#ffffff", gmail),
    ("classroom", "Classroom", "Google Classroom", "#0f9d58", classroom),
    ("google", "Google", "Google", "#ffffff", google),
    ("khan", "Khan Academy", "Khan Academy", "#14bf96", khan),
    ("canvas", "Canvas", "Canvas", "#e13b2f", lambda: solid_letter("#e13b2f", "C", px=0.52)),
    ("schoology", "Schoology", "Schoology", "#0d78c4", lambda: solid_letter("#0d78c4", "S", px=0.52)),
    ("desmos", "Desmos", "Desmos Graphing Calculator", "#ffffff", desmos),
    ("campus", "Campus", "Infinite Campus", "#1b3d6d", lambda: solid_letter("#1b3d6d", "IC", px=0.34)),
    ("formative", "Formative", "Formative", "#6a3fbf", lambda: solid_letter("#6a3fbf", "F", px=0.52)),
    ("clever", "Clever", "Clever Portal", "#436cf0", lambda: solid_letter("#436cf0", "C", px=0.52)),
    ("d203", "District 203", "Naperville CUSD 203", "#0b2f5e", lambda: solid_letter("#0b2f5e", "203", px=0.28)),
]


def main():
    os.makedirs(ICONS, exist_ok=True)
    os.makedirs(MANIFESTS, exist_ok=True)
    for pid, short, name, theme, make in PRESETS:
        art = make().convert("RGBA")
        for size in (192, 512):
            art.resize((size, size), Image.LANCZOS).save(
                os.path.join(ICONS, "%s-%d.png" % (pid, size)), optimize=True)

        # Maskable: the same art inset to 62% so Android's circle crop cannot
        # clip it, on an opaque plate.
        maskable = Image.new("RGBA", (S, S), theme)
        inner = art.resize((int(S * 0.62), int(S * 0.62)), Image.LANCZOS)
        maskable.alpha_composite(inner, (int(S * 0.19), int(S * 0.19)))
        maskable.resize((512, 512), Image.LANCZOS).save(
            os.path.join(ICONS, "%s-maskable.png" % pid), optimize=True)

        manifest = {
            "id": "/?app=" + pid,
            "name": name,
            "short_name": short,
            "start_url": "/?app=" + pid,
            "scope": "/",
            "display": "standalone",
            "orientation": "any",
            "background_color": theme,
            "theme_color": theme,
            "icons": [
                {"src": "/icons/%s-192.png" % pid, "sizes": "192x192", "type": "image/png", "purpose": "any"},
                {"src": "/icons/%s-512.png" % pid, "sizes": "512x512", "type": "image/png", "purpose": "any"},
                {"src": "/icons/%s-maskable.png" % pid, "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
            ],
        }
        with open(os.path.join(MANIFESTS, "%s.webmanifest" % pid), "w") as f:
            json.dump(manifest, f, indent=2)
            f.write("\n")
        print("wrote", pid)


if __name__ == "__main__":
    main()
