#!/usr/bin/env python3
"""
waterline_to_mask.py : détecte la limite eau/sable frame par frame et fabrique
un cache WebM avec canal alpha — eau = OPAQUE, sable = TRANSPARENT.

Le principe : dans une vue aérienne mer/sable, le sable beige a un canal
rouge très au-dessus du bleu (R ≫ B), l'eau de mer est cyan/teal (B ≥ R).
On classe donc chaque pixel par le score `R - B`, avec une bande de
transition réglable, un lissage spatial (flou séparé) et un lissage
temporel (EMA) pour éviter le scintillement du ressac.

Dépendances : ffmpeg + ffprobe dans le PATH, et numpy (pip install numpy).

Usage :
    python waterline_to_mask.py in.mp4 cache-line.webm
    options :
      --threshold 10     score R-B au-dessus duquel un pixel est « sable »
                         (défaut 0 : tout pixel où R > B est du sable)
      --softness 20      largeur de la bande de transition en unités de score
                         (0 = bord dur)
      --spatial 8        rayon du flou spatial en px (0 = désactivé)
      --temporal 0.4     inertie temporelle 0..1 (part du masque précédent
                         conservée dans la frame suivante ; 0 = désactivé)
      --crf 20           qualité WebM (plus bas = meilleure)
      --stats            affiche le niveau d'eau à 4 hauteurs d'image
                         sur la première et la dernière frame
"""

import argparse
import json
import subprocess

import numpy as np

MAX_DIST = float(np.sqrt(3 * 255**2))  # distance RGB maximale (info/compat)


def probe(path):
    out = subprocess.check_output(
        [
            "ffprobe", "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=width,height,r_frame_rate",
            "-of", "json", path,
        ]
    )
    st = json.loads(out)["streams"][0]
    num, den = st["r_frame_rate"].split("/")
    return int(st["width"]), int(st["height"]), float(num) / float(den)


def open_decoder(path):
    return subprocess.Popen(
        ["ffmpeg", "-v", "error", "-i", path, "-an", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        stdout=subprocess.PIPE,
    )


def open_encoder_alpha(path, w, h, fps, crf):
    return subprocess.Popen(
        [
            "ffmpeg", "-v", "error", "-y",
            "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{w}x{h}", "-r", str(fps), "-i", "-",
            "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", str(crf),
            "-auto-alt-ref", "0", path,
        ],
        stdin=subprocess.PIPE,
    )


def frames(dec, w, h):
    size = w * h * 3
    while True:
        buf = dec.stdout.read(size)
        if len(buf) < size:
            return
        yield np.frombuffer(buf, dtype=np.uint8).reshape(h, w, 3).astype(np.float32)


def box1d(a, r, axis):
    """Flou rectangulaire séparé (fenêtre 2r+1), numpy pur, bords répliqués."""
    if r <= 0:
        return a
    pad = [(0, 0)] * a.ndim
    pad[axis] = (r, r)
    ap = np.pad(a, pad, mode="edge")
    c = np.cumsum(ap, axis=axis)
    win = 2 * r + 1
    # On préfixe un zéro : la somme glissante est alors c0[i+win] - c0[i]
    one = [(0, 0)] * a.ndim
    one[axis] = (1, 0)
    c0 = np.pad(c, one)
    sl_hi = [slice(None)] * a.ndim
    sl_lo = [slice(None)] * a.ndim
    sl_hi[axis] = slice(win, win + a.shape[axis])
    sl_lo[axis] = slice(0, a.shape[axis])
    return ((c0[tuple(sl_hi)] - c0[tuple(sl_lo)]) / win).astype(np.float32)


def stats_row(alpha, label):
    h = alpha.shape[0]
    rows = [0.15, 0.40, 0.65, 0.90]
    vals = [float(alpha[int(h * t)].mean()) for t in rows]
    pretty = ", ".join(f"{int(t*100)}%: {v:.2f}" for t, v in zip(rows, vals))
    print(f"{label} — eau (alpha) à 15/40/65/90 % de hauteur : [{pretty}]")


def run(args):
    w, h, fps = probe(args.input)
    dec = open_decoder(args.input)
    enc = open_encoder_alpha(args.output, w, h, fps, args.crf)

    spatial_r = int(round(args.spatial / 100 * h)) if args.spatial_is_percent else int(args.spatial)
    prev = None
    first = None
    last = None
    n = 0
    for f in frames(dec, w, h):
        # Score « sable » : R - B. Beige ≫ 0, cyan/teal ≤ 0, mousse ≈ 0 (→ eau).
        score = f[..., 0] - f[..., 2]
        # 1 = eau, 0 = sable, avec bande de transition autour du seuil
        cur = np.clip(0.5 - (score - args.threshold) / max(args.softness, 1e-6), 0.0, 1.0)
        if spatial_r > 0:
            cur = box1d(box1d(cur, spatial_r, axis=0), spatial_r, axis=1)
        if prev is not None and args.temporal > 0:
            cur = args.temporal * prev + (1.0 - args.temporal) * cur
        prev = cur
        if first is None:
            first = cur
        last = cur

        out = np.empty((h, w, 4), dtype=np.uint8)
        g = (cur * 255).astype(np.uint8)
        out[..., 0] = g  # rgb = blanc là où opaque (cache lisible seul aussi)
        out[..., 1] = g
        out[..., 2] = g
        out[..., 3] = g  # l'alpha porte le masque : eau opaque, sable transparent
        enc.stdin.write(out.tobytes())
        n += 1

    enc.stdin.close()
    enc.wait()
    dec.wait()
    print(f"{n} images traitées -> {args.output}")
    if args.stats:
        stats_row(first, "1re frame")
        stats_row(last, "dernière")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input")
    ap.add_argument("output", help="fichier .webm de sortie (VP9 alpha)")
    ap.add_argument("--threshold", type=float, default=0.0,
                    help="score R-B au-dessus duquel un pixel est sable (défaut 0)")
    ap.add_argument("--softness", type=float, default=20.0,
                    help="largeur de la bande de transition en unités de score (défaut 20)")
    ap.add_argument("--spatial", type=float, default=8.0,
                    help="rayon du flou spatial en px (défaut 8, 0 = désactivé)")
    ap.add_argument("--spatial-is-percent", action="store_true",
                    help="le rayon spatial est exprimé en %% de la hauteur")
    ap.add_argument("--temporal", type=float, default=0.4,
                    help="inertie temporelle 0..1 : part du masque précédent conservée (défaut 0.4, 0 = off)")
    ap.add_argument("--crf", type=int, default=20, help="qualité VP9 (défaut 20)")
    ap.add_argument("--stats", action="store_true", help="affiche le niveau d'eau par hauteur d'image")
    a = ap.parse_args()
    run(a)


if __name__ == "__main__":
    main()
