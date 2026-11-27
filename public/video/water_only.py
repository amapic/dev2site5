#!/usr/bin/env python3
"""
water_only.py : fabrique une vidéo WebM avec canal alpha où l'on NE VOIT
QUE l'EAU — le sable est entièrement remplacé par de la transparence
(alpha 0), et la zone eau conserve les couleurs de la frame d'origine.

Variante « visible » de waterline_to_mask.py : au lieu d'un cache blanc
(rgb = alpha, utile pour destination-in), cette version recopie les couleurs
de la frame d'origine sous l'alpha. Posée telle quelle au-dessus d'un autre
calque, l'eau flotte et le sable laisse voir ce qui est dessous.

Classement sable/eau identique à waterline_to_mask.py : score R - B
(beige ≫ 0 = sable, cyan ≤ 0 = eau, mousse ≈ 0 → eau), bande de transition,
flou spatial séparé, inertie temporelle EMA anti-scintillement.

Dépendances : ffmpeg + ffprobe dans le PATH, et numpy (pip install numpy).

Usage :
    python water_only.py in.mp4 eau.webm
    options :
      --threshold 0     score R-B au-dessus duquel un pixel est « sable »
      --softness 20     largeur de la bande de transition en unités de score
      --spatial 8       rayon du flou spatial en px (0 = désactivé)
      --temporal 0.4    inertie temporelle 0..1 (0 = désactivé)
      --crf 20          qualité WebM VP9 (plus bas = meilleure)
      --stats           niveau d'eau à 4 hauteurs, 1re et dernière frame
"""

import argparse
import subprocess

import numpy as np

from waterline_to_mask import (
    box1d,
    frames,
    probe,
)


def open_decoder(path, vf=None):
    """Décodeur local, avec filtre d'entrée optionnel (ex : --scale)."""
    cmd = ["ffmpeg", "-v", "error", "-i", path]
    if vf:
        cmd += ["-vf", vf]
    cmd += ["-an", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    return subprocess.Popen(cmd, stdout=subprocess.PIPE)


def open_encoder_alpha(path, w, h, fps, crf, keyint=0):
    """Encodeur local : accepte une période de keyframes (--keyint)."""
    cmd = [
        "ffmpeg", "-v", "error", "-y",
        "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{w}x{h}", "-r", str(fps), "-i", "-",
        "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", str(crf),
        "-auto-alt-ref", "0",
    ]
    if keyint > 0:
        # Keyframes fréquentes : les seeks VP9 repartent d'une keyframe,
        # donc plus -g est petit, plus le scrub navigateur est réactif.
        cmd += ["-g", str(keyint), "-keyint_min", str(keyint)]
    cmd.append(path)
    return subprocess.Popen(cmd, stdin=subprocess.PIPE)


def stats_row(alpha, label):
    h = alpha.shape[0]
    rows = [0.15, 0.40, 0.65, 0.90]
    vals = [float(alpha[int(h * t)].mean()) for t in rows]
    pretty = ", ".join(f"{int(t*100)}%: {v:.2f}" for t, v in zip(rows, vals))
    print(f"{label} — eau (alpha) à 15/40/65/90 % de hauteur : [{pretty}]")


def run(args):
    W, H, fps = probe(args.input)
    # --scale : largeur cible ; hauteur ajustée, arrondie à un nombre pair
    # (exigence yuva420p). Le masque est recalculé APRÈS réduction.
    if args.scale and args.scale < W:
        w = int(args.scale)
        h = int(round(H * args.scale / W / 2)) * 2
        vf = f"scale={w}:{h}"
    else:
        w, h = W, H
        vf = None
    dec = open_decoder(args.input, vf=vf)
    enc = open_encoder_alpha(args.output, w, h, fps, args.crf, keyint=args.keyint)

    spatial_r = int(round(args.spatial / 100 * h)) if args.spatial_is_percent else int(args.spatial)
    prev = None
    first = None
    last = None
    n = 0
    for f in frames(dec, w, h):
        score = f[..., 0] - f[..., 2]
        # alpha = 1 sur l'eau (score faible), 0 sur le sable (score élevé)
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
        out[..., 0:3] = f.astype(np.uint8)  # couleurs d'origine (l'eau, la mousse)
        out[..., 3] = (cur * 255).astype(np.uint8)  # sable transparent, eau opaque
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
    ap.add_argument("output", help="fichier .webm de sortie (VP9 alpha, eau visible / sable transparent)")
    ap.add_argument("--threshold", type=float, default=0.0,
                    help="score R-B au-dessus duquel un pixel est sable (défaut 0)")
    ap.add_argument("--softness", type=float, default=20.0,
                    help="largeur de la bande de transition en unités de score (défaut 20)")
    ap.add_argument("--spatial", type=float, default=8.0,
                    help="rayon du flou spatial en px (défaut 8, 0 = désactivé)")
    ap.add_argument("--spatial-is-percent", action="store_true",
                    help="le rayon spatial est exprimé en %% de la hauteur")
    ap.add_argument("--temporal", type=float, default=0.4,
                    help="inertie temporelle 0..1 (défaut 0.4, 0 = off)")
    ap.add_argument("--crf", type=int, default=20, help="qualité VP9 (défaut 20)")
    ap.add_argument("--scale", type=int, default=0,
                    help="largeur cible en px (0 = résolution source)")
    ap.add_argument("--keyint", type=int, default=0,
                    help="période des keyframes (0 = défaut VP9 ; 12 = scrub rapide)")
    ap.add_argument("--stats", action="store_true", help="affiche le niveau d'eau par hauteur d'image")
    a = ap.parse_args()
    run(a)


if __name__ == "__main__":
    main()
