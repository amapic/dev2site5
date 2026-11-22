#!/usr/bin/env python3
"""
video_to_mask.py : deux outils pour fabriquer des vidéos-caches pour le web.

Dépendances : ffmpeg + ffprobe dans le PATH, et numpy  (pip install numpy)

1) key : rend une couleur (et les couleurs proches) TRANSPARENTE  -> WebM VP9 avec alpha
   python video_to_mask.py key in.mp4 cache.webm --color "#e3c998" --tolerance 15 --softness 10

   --color      couleur à rendre transparente (#rrggbb ou r,g,b)
   --tolerance  proximité (0-100 %) : tout pixel dont la distance à la couleur est
                inférieure à ce seuil devient totalement transparent
   --softness   zone de transition (0-100 %) au-delà de la tolérance, pour un bord
                progressif au lieu d'un bord dur (0 = bord dur)
   --others     ce que deviennent les pixels non transparents :
                original (défaut) | black | white

2) mask : remplace une couleur par du blanc et une autre par du noir -> MP4 noir et blanc
   python video_to_mask.py mask in.mp4 masque.mp4 --white "#ff0000" --black "#0000ff"
   (--mode soft|hard, --threshold 0.5)
"""
import argparse
import json
import subprocess
import sys

import numpy as np

MAX_DIST = float(np.sqrt(3 * 255 ** 2))  # distance RGB maximale (~441.67)


def parse_color(s):
    s = s.strip().lstrip("#")
    if "," in s:
        r, g, b = (int(x) for x in s.split(","))
    elif len(s) == 6:
        r, g, b = int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16)
    else:
        raise argparse.ArgumentTypeError(f"couleur invalide : {s}")
    return np.array([r, g, b], dtype=np.float32)


def probe(path):
    out = subprocess.check_output([
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height,r_frame_rate",
        "-of", "json", path,
    ])
    st = json.loads(out)["streams"][0]
    num, den = st["r_frame_rate"].split("/")
    return int(st["width"]), int(st["height"]), float(num) / float(den)


def open_decoder(path):
    return subprocess.Popen([
        "ffmpeg", "-v", "error", "-i", path, "-an",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
    ], stdout=subprocess.PIPE)


def open_encoder_alpha(path, w, h, fps, crf):
    return subprocess.Popen([
        "ffmpeg", "-v", "error", "-y",
        "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{w}x{h}", "-r", str(fps), "-i", "-",
        "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", str(crf),
        "-auto-alt-ref", "0", path,
    ], stdin=subprocess.PIPE)


def open_encoder_gray(path, w, h, fps, crf):
    return subprocess.Popen([
        "ffmpeg", "-v", "error", "-y",
        "-f", "rawvideo", "-pix_fmt", "gray", "-s", f"{w}x{h}", "-r", str(fps), "-i", "-",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", str(crf),
        "-movflags", "+faststart", path,
    ], stdin=subprocess.PIPE)


def frames(dec, w, h):
    size = w * h * 3
    while True:
        buf = dec.stdout.read(size)
        if len(buf) < size:
            return
        yield np.frombuffer(buf, dtype=np.uint8).reshape(h, w, 3).astype(np.float32)


def run_key(a):
    w, h, fps = probe(a.input)
    K = a.color
    tol = a.tolerance / 100.0
    soft = a.softness / 100.0
    dec = open_decoder(a.input)
    enc = open_encoder_alpha(a.output, w, h, fps, a.crf)

    n = 0
    for f in frames(dec, w, h):
        dist = np.linalg.norm(f - K, axis=-1) / MAX_DIST          # 0 = identique, 1 = opposé
        if soft > 0:
            alpha = np.clip((dist - tol) / soft, 0.0, 1.0)         # 0 transparent -> 1 opaque
        else:
            alpha = (dist > tol).astype(np.float32)

        if a.others == "original":
            # retire la contamination beige sur les bords semi-transparents
            a3 = alpha[..., None]
            rgb = np.where(a3 > 0.001, (f - (1.0 - a3) * K) / np.maximum(a3, 0.001), f)
            rgb = np.clip(rgb, 0, 255)
        else:
            rgb = np.full_like(f, 0.0 if a.others == "black" else 255.0)

        out = np.empty((h, w, 4), dtype=np.uint8)
        out[..., :3] = rgb.astype(np.uint8)
        out[..., 3] = (alpha * 255).astype(np.uint8)
        enc.stdin.write(out.tobytes())
        n += 1

    enc.stdin.close(); enc.wait(); dec.wait()
    print(f"{n} images traitées -> {a.output}")


def run_mask(a):
    w, h, fps = probe(a.input)
    B, A = a.black, a.white
    axis = A - B
    denom = float(np.dot(axis, axis))
    if denom == 0:
        sys.exit("Les deux couleurs doivent être différentes.")
    dec = open_decoder(a.input)
    enc = open_encoder_gray(a.output, w, h, fps, a.crf)

    n = 0
    for f in frames(dec, w, h):
        t = np.clip(((f - B) @ axis) / denom, 0.0, 1.0)            # 0 = couleur noire, 1 = couleur blanche
        if a.mode == "hard":
            t = (t >= a.threshold).astype(np.float32)
        enc.stdin.write((t * 255).astype(np.uint8).tobytes())
        n += 1

    enc.stdin.close(); enc.wait(); dec.wait()
    print(f"{n} images traitées -> {a.output}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    k = sub.add_parser("key", help="couleur -> transparent (WebM alpha)")
    k.add_argument("input"); k.add_argument("output", help="fichier .webm")
    k.add_argument("--color", type=parse_color, required=True, help="couleur à rendre transparente")
    k.add_argument("--tolerance", type=float, default=15, help="proximité 0-100 %% (défaut 15)")
    k.add_argument("--softness", type=float, default=10, help="transition 0-100 %% (défaut 10, 0 = bord dur)")
    k.add_argument("--others", choices=["original", "black", "white"], default="original")
    k.add_argument("--crf", type=int, default=24)
    k.set_defaults(fn=run_key)

    m = sub.add_parser("mask", help="deux couleurs -> blanc / noir (MP4)")
    m.add_argument("input"); m.add_argument("output", help="fichier .mp4")
    m.add_argument("--white", type=parse_color, required=True)
    m.add_argument("--black", type=parse_color, required=True)
    m.add_argument("--mode", choices=["soft", "hard"], default="soft")
    m.add_argument("--threshold", type=float, default=0.5)
    m.add_argument("--crf", type=int, default=18)
    m.set_defaults(fn=run_mask)

    a = ap.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
