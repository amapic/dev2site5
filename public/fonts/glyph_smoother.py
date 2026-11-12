#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GlyphSmoother — lissage doux des contours d'une police TrueType (.ttf).

Dépendances :
    py -m pip install fonttools numpy pillow

L'outil :
- conserve les métriques et les noms de glyphes ;
- lisse les contours des glyphes TrueType simples ;
- laisse les glyphes composites intacts (accents assemblés, etc.) ;
- propose un aperçu avant/après et exporte dans un nouveau fichier.

Conseil : commencer avec une intensité faible (0.9 à 1.4).
Travaille toujours sur une COPIE de ta police.
"""

from __future__ import annotations

import os
import tempfile
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

import numpy as np
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._g_l_y_f import GlyphCoordinates
from PIL import Image, ImageDraw, ImageFont, ImageTk


def smooth_closed_contour(points: np.ndarray, strength: float) -> np.ndarray:
    """Filtre gaussien circulaire, avec conservation de la boîte englobante."""
    n = len(points)
    if n < 7 or strength <= 0:
        return points.copy()

    # Le filtre agit sur l'ordre des points du contour. Le mode wrap évite
    # une cassure artificielle au point de fermeture.
    radius = max(0.35, float(strength))
    half = max(1, int(np.ceil(radius * 3)))
    x = np.arange(-half, half + 1, dtype=float)
    kernel = np.exp(-(x * x) / (2 * radius * radius))
    kernel /= kernel.sum()

    result = np.empty_like(points, dtype=float)
    for axis in range(2):
        padded = np.concatenate((points[-half:, axis], points[:, axis],
                                 points[:half, axis]))
        result[:, axis] = np.convolve(padded, kernel, mode="valid")

    # Préserve le centre et l'encombrement global du contour :
    # le filtre ne doit pas faire "fondre" visiblement la lettre.
    old_min, old_max = points.min(axis=0), points.max(axis=0)
    new_min, new_max = result.min(axis=0), result.max(axis=0)
    old_size = old_max - old_min
    new_size = new_max - new_min
    for axis in range(2):
        if new_size[axis] > 1e-6 and old_size[axis] > 0:
            result[:, axis] = (
                (result[:, axis] - new_min[axis])
                * (old_size[axis] / new_size[axis])
                + old_min[axis]
            )
        else:
            result[:, axis] += (old_min[axis] - new_min[axis])

    return result


def process_font(source: str, destination: str, strength: float) -> tuple[int, int]:
    font = TTFont(source)
    if "glyf" not in font:
        raise ValueError("Ce fichier ne semble pas être une police TrueType à contours glyf.")

    glyf_table = font["glyf"]
    changed = 0
    skipped_composites = 0

    for glyph_name in font.getGlyphOrder():
        glyph = glyf_table[glyph_name]

        # Les glyphes composites sont souvent des lettres accentuées construites
        # à partir d'une lettre + accent. On les laisse intacts pour éviter
        # de casser leurs références internes.
        if glyph.isComposite():
            skipped_composites += 1
            continue
        if glyph.numberOfContours <= 0:
            continue

        coords, end_points, flags = glyph.getCoordinates(glyf_table)
        arr = np.asarray([(p[0], p[1]) for p in coords], dtype=float)
        if len(arr) < 7:
            continue

        start = 0
        updated = arr.copy()
        for end in end_points:
            stop = int(end) + 1
            contour = arr[start:stop]
            # Intensité adaptative : les contours très denses tolèrent un
            # peu plus de lissage que les petits contours peu échantillonnés.
            adaptive = min(2.4, max(0.45, strength * (len(contour) / 45.0) ** 0.35))
            updated[start:stop] = smooth_closed_contour(contour, adaptive)
            start = stop

        glyph.coordinates = GlyphCoordinates(
            [(int(round(x)), int(round(y))) for x, y in updated]
        )
        glyph.endPtsOfContours = list(end_points)
        glyph.flags = flags
        from fontTools.ttLib.tables.ttProgram import Program

        glyph.program = Program()
        glyph.program.fromBytecode(b"") # le hinting ancien ne correspond plus aux nouveaux points
        changed += 1

    # Les instructions TrueType globales peuvent aussi être inadaptées après
    # déplacement des points : on retire le hinting, pas les contours.
    for table_name in ("fpgm", "prep", "cvt "):
        if table_name in font:
            del font[table_name]
    if "maxp" in font:
        font["maxp"].maxSizeOfInstructions = 0

    font.save(destination)
    font.close()
    return changed, skipped_composites


class GlyphSmootherApp:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("GlyphSmoother — nettoyage de police manuscrite")
        self.root.geometry("900x650")
        self.root.minsize(760, 560)

        self.source = tk.StringVar()
        self.sample = tk.StringVar(value="Bonjour, écriture ! 0123456789")
        self.strength = tk.DoubleVar(value=1.15)
        self.status = tk.StringVar(value="Choisis une police TTF pour commencer.")
        self.preview_image = None
        self.temp_preview = None

        outer = ttk.Frame(root, padding=16)
        outer.pack(fill="both", expand=True)

        ttk.Label(outer, text="GLYPH SMOOTHER", font=("Segoe UI", 17, "bold")).pack(anchor="w")
        ttk.Label(
            outer,
            text="Lissage adaptatif des contours — le dessin général est conservé.",
        ).pack(anchor="w", pady=(0, 14))

        file_row = ttk.Frame(outer)
        file_row.pack(fill="x")
        ttk.Entry(file_row, textvariable=self.source).pack(side="left", fill="x", expand=True)
        ttk.Button(file_row, text="Ouvrir une police TTF…", command=self.choose_file).pack(
            side="left", padx=(8, 0)
        )

        settings = ttk.LabelFrame(outer, text="Réglage du lissage", padding=12)
        settings.pack(fill="x", pady=14)
        scale_row = ttk.Frame(settings)
        scale_row.pack(fill="x")
        ttk.Label(scale_row, text="Léger").pack(side="left")
        ttk.Scale(
            scale_row, from_=0.35, to=2.8, variable=self.strength,
            orient="horizontal"
        ).pack(side="left", fill="x", expand=True, padx=12)
        ttk.Label(scale_row, text="Prononcé").pack(side="left")
        self.strength_label = ttk.Label(settings, text="1.15")
        self.strength_label.pack(anchor="e")
        self.strength.trace_add("write", self.update_strength_label)

        sample_row = ttk.Frame(outer)
        sample_row.pack(fill="x", pady=(0, 8))
        ttk.Label(sample_row, text="Texte d'aperçu :").pack(side="left")
        ttk.Entry(sample_row, textvariable=self.sample).pack(
            side="left", fill="x", expand=True, padx=(8, 0)
        )

        buttons = ttk.Frame(outer)
        buttons.pack(fill="x", pady=(0, 10))
        ttk.Button(buttons, text="Générer l'aperçu", command=self.make_preview).pack(side="left")
        ttk.Button(
            buttons, text="Exporter la police lissée…", command=self.export_font
        ).pack(side="left", padx=8)

        previews = ttk.Frame(outer)
        previews.pack(fill="both", expand=True)
        self.before_canvas = self.make_preview_panel(previews, "AVANT")
        self.after_canvas = self.make_preview_panel(previews, "APRÈS")

        ttk.Label(outer, textvariable=self.status, wraplength=850).pack(
            anchor="w", pady=(10, 0)
        )
        ttk.Label(
            outer,
            text=("Note : les glyphes composites (notamment certains accents) sont conservés "
                  "sans modification. Le hinting écran est retiré pour éviter des artefacts."),
            foreground="#666",
            wraplength=850,
        ).pack(anchor="w", pady=(5, 0))

    def make_preview_panel(self, parent, title):
        frame = ttk.LabelFrame(parent, text=title, padding=8)
        frame.pack(side="left", fill="both", expand=True, padx=(0, 6))
        canvas = tk.Canvas(frame, background="white", highlightthickness=0)
        canvas.pack(fill="both", expand=True)
        return canvas

    def update_strength_label(self, *_):
        self.strength_label.configure(text=f"{self.strength.get():.2f}")

    def choose_file(self):
        path = filedialog.askopenfilename(
            title="Choisir une police TrueType",
            filetypes=[("Polices TrueType", "*.ttf"), ("Tous les fichiers", "*.*")]
        )
        if path:
            self.source.set(path)
            self.status.set(f"Police chargée : {os.path.basename(path)}")

    def render_text(self, font_path: str, canvas: tk.Canvas):
        canvas.delete("all")
        canvas.update_idletasks()
        w = max(300, canvas.winfo_width())
        h = max(180, canvas.winfo_height())
        image = Image.new("RGB", (w, h), "white")
        draw = ImageDraw.Draw(image)

        try:
            pil_font = ImageFont.truetype(font_path, 54)
        except Exception:
            pil_font = ImageFont.truetype("arial.ttf", 42)

        text = self.sample.get() or "Aa Bb Cc 0123"
        margin = 18
        y = margin
        lines = []
        current = ""
        for word in text.split(" "):
            candidate = (current + " " + word).strip()
            if draw.textbbox((0, 0), candidate, font=pil_font)[2] > w - 2 * margin and current:
                lines.append(current)
                current = word
            else:
                current = candidate
        if current:
            lines.append(current)

        for line in lines:
            draw.text((margin, y), line, font=pil_font, fill="black")
            y += 72
            if y > h - 55:
                break

        photo = ImageTk.PhotoImage(image)
        canvas.image = photo
        canvas.create_image(0, 0, image=photo, anchor="nw")

    def make_preview(self):
        source = self.source.get()
        if not source or not os.path.isfile(source):
            messagebox.showwarning("Police manquante", "Choisis d'abord un fichier TTF.")
            return
        try:
            if self.temp_preview and os.path.exists(self.temp_preview):
                os.remove(self.temp_preview)
            fd, temp_path = tempfile.mkstemp(suffix=".ttf")
            os.close(fd)
            changed, skipped = process_font(source, temp_path, self.strength.get())
            self.temp_preview = temp_path
            self.render_text(source, self.before_canvas)
            self.render_text(temp_path, self.after_canvas)
            self.status.set(
                f"Aperçu prêt — {changed} glyphes traités ; "
                f"{skipped} glyphes composites laissés intacts."
            )
        except Exception as exc:
            messagebox.showerror("Erreur pendant l'aperçu", str(exc))
            self.status.set("L'aperçu a échoué.")

    def export_font(self):
        source = self.source.get()
        if not source or not os.path.isfile(source):
            messagebox.showwarning("Police manquante", "Choisis d'abord un fichier TTF.")
            return
        default_name = os.path.splitext(os.path.basename(source))[0] + "-smoothed.ttf"
        destination = filedialog.asksaveasfilename(
            title="Exporter la police lissée",
            initialfile=default_name,
            defaultextension=".ttf",
            filetypes=[("Police TrueType", "*.ttf")]
        )
        if not destination:
            return
        try:
            changed, skipped = process_font(source, destination, self.strength.get())
            self.status.set(
                f"Export terminé : {destination} — {changed} glyphes traités, "
                f"{skipped} composites conservés."
            )
            messagebox.showinfo(
                "Export terminé",
                f"Police enregistrée :\n{destination}\n\n"
                f"{changed} glyphes traités.\n"
                f"{skipped} glyphes composites conservés."
            )
        except Exception as exc:
            messagebox.showerror("Erreur d'export", str(exc))


def main():
    root = tk.Tk()
    try:
        style = ttk.Style()
        if "vista" in style.theme_names():
            style.theme_use("vista")
    except Exception:
        pass
    GlyphSmootherApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
