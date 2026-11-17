import * as THREE from "three";

/* ------------------------------------------------------------------ */
/* Champ de distance signé (SDF) des patatoïdes du rail.               */
/* Chaque forme — patatoïde harmonique par défaut, ou SVG fermé        */
/* sculpté dans l'outil — est recuite une fois en texture : à chaque   */
/* pixel, la distance signée en unités monde (positif = intérieur).    */
/* Le fragment shader du bord encre (ink-blob-image.tsx) échantillonne */
/* deux champs (forme de début, forme de fin) et les mixe par uMorph.  */
/* ------------------------------------------------------------------ */

// Résolution du recuit (carré) et demi-taille du domaine couvert, en
// unités monde où 1 = demi-hauteur du cadre : un patatoïde de rayon
// ~0.47 (base + harmoniques + respiration) tient largement dedans.
export const FIELD_RES = 512;
export const FIELD_SPAN = 0.9;

// Bornes du recuit « écran » (texels carrés en unités monde — la
// calibration reste isotrope). La hauteur est calée sur les pixels réels
// du cadre quand elle est connue : un texel ≈ 1 px écran, sinon les
// marches du recuit deviennent visibles au rendu (bords granuleux).
export const FIELD_MAX_H = 1024;
export const FIELD_MIN_H = 128;
export const FIELD_MAX_W = 2048;

// Hauteur de grille du recuit écran : `targetPx` (hauteur du cadre en
// pixels CSS) en priorité, sinon dérivée de l'aspect (comportement léger).
export function screenFieldHeight(aspect: number, targetPx?: number): number {
  const wanted = targetPx ? Math.round(targetPx) : FIELD_RES / aspect;
  return Math.min(FIELD_MAX_H, Math.max(FIELD_MIN_H, Math.round(wanted)));
}

// Largeur de grille assortie (texels carrés), bornée pour les très larges écrans.
export function screenFieldWidth(h: number, aspect: number): number {
  return Math.min(FIELD_MAX_W, Math.max(FIELD_MIN_H, Math.round(h * aspect)));
}

// Rayon de base de référence au moment du recuit harmonique : à
// l'exécution, la taille retenue par le HUD est appliquée en pur facteur
// d'échelle (uShapeScale = baseRadius / INK_BAKE_BASE), sans recuire.
export const INK_BAKE_BASE = 0.34;

// Amplitudes des 4 harmoniques angulaires de la forme patate (multiplicateur commun : harm).
const HARMONIC_AMPLITUDES = [0.11, 0.07, 0.05, 0.03] as const;

// Graines des harmoniques angulaires : chaque variante (blob-N) a son
// propre patatoïde, reproductible d'un rendu à l'autre.
export function shapeSeed(variant: number) {
  const channel = (k: number) => {
    const x = Math.sin((variant + 1) * 12.9898 + k * 78.233) * 43758.5453;
    return (x - Math.floor(x)) * Math.PI * 2;
  };
  return new THREE.Vector4(channel(1), channel(2), channel(3), channel(4));
}

/* --------------------- Distance transform (Felzenszwalb & Huttenlocher) --------------------- */

const SDF_INF = 1e12;

// Distance euclidienne au carré de chaque pixel au pixel de plus proche
// « source » (valeur 0) — transform two-pass, lignes puis colonnes.
function edt1d(
  f: Float64Array,
  d: Float64Array,
  v: Int32Array,
  z: Float64Array,
  len: number,
): void {
  let k = 0;
  v[0] = 0;
  z[0] = -SDF_INF;
  z[1] = SDF_INF;
  for (let q = 1; q < len; q++) {
    const fq = f[q] ?? 0;
    const vk = v[k] ?? 0;
    let s = fq + q * q - (f[vk] ?? 0) - vk * vk;
    const denom = 2 * q - 2 * vk;
    s = denom === 0 ? SDF_INF : s / denom;
    while (s <= (z[k] ?? 0)) {
      k--;
      const vk2 = v[k] ?? 0;
      const denom2 = 2 * q - 2 * vk2;
      s = denom2 === 0 ? SDF_INF : (fq + q * q - (f[vk2] ?? 0) - vk2 * vk2) / denom2;
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = SDF_INF;
  }
  k = 0;
  for (let q = 0; q < len; q++) {
    while ((z[k + 1] ?? 0) < q) k++;
    const vk = v[k] ?? 0;
    d[q] = (q - vk) * (q - vk) + (f[vk] ?? SDF_INF);
  }
}

function edt2d(grid: Float64Array, w: number, h: number): void {
  const f = new Float64Array(Math.max(w, h));
  const d = new Float64Array(Math.max(w, h));
  const v = new Int32Array(Math.max(w, h));
  const z = new Float64Array(Math.max(w, h) + 1);
  // Lignes
  let rowStart = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[rowStart + x] ?? SDF_INF;
    edt1d(f, d, v, z, w);
    for (let x = 0; x < w; x++) grid[rowStart + x] = d[x] ?? SDF_INF;
    rowStart += w;
  }
  // Colonnes
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x] ?? SDF_INF;
    edt1d(f, d, v, z, h);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y] ?? SDF_INF;
  }
}

/* --------------------- Rasterisation : masque binaire → texture SDF --------------------- */

function readMask(ctx: CanvasRenderingContext2D, w: number, h: number): Uint8Array | null {
  const img = ctx.getImageData(0, 0, w, h).data;
  const mask = new Uint8Array(w * h);
  let count = 0;
  for (let i = 0; i < mask.length; i++) {
    const inside = (img[i * 4 + 3] ?? 0) >= 100 ? 1 : 0;
    mask[i] = inside;
    count += inside;
  }
  // Rien dans le masque (SVG vide, image manquante…) : la forme est ignorée.
  return count > 4 ? mask : null;
}

/**
 * Remplit un buffer de demi-floats avec la distance signée du masque
 * (unités monde). `scale` donne le nombre de texels par unité monde —
 * il est uniforme x/y (les texels restent carrés) : legacy 1 texel =
 * 2·FIELD_SPAN/FIELD_RES unités ; écran 1 texel = 1/hauteur de grille.
 */
function bakeSdfData(
  mask: Uint8Array,
  out: Uint16Array,
  w: number,
  h: number,
  texelsPerUnit: number,
): void {
  const n = w * h;
  const nearInside = new Float64Array(n);
  const nearOutside = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    nearInside[i] = mask[i] ? 0 : SDF_INF; // sources = pixels intérieurs
    nearOutside[i] = mask[i] ? SDF_INF : 0; // sources = pixels extérieurs
  }
  edt2d(nearInside, w, h);
  edt2d(nearOutside, w, h);

  // Distance signée : + à l'intérieur (distance au bord le plus proche
  // mesurée côté extérieur), − dehors. Bornée au domaine du recuit.
  const clampDist = Math.max(w, h) / texelsPerUnit;
  for (let i = 0; i < n; i++) {
    const dist = mask[i]
      ? Math.sqrt(nearOutside[i] ?? SDF_INF)
      : -Math.sqrt(nearInside[i] ?? SDF_INF);
    out[i] = THREE.DataUtils.toHalfFloat(
      Math.max(-clampDist, Math.min(clampDist, dist / texelsPerUnit)),
    );
  }
}

/** Renvoie un DataTexture R16F : distance signée en unités monde (positif intérieur). */
export function maskToFieldTexture(
  mask: Uint8Array,
  w: number,
  h: number,
  texelsPerUnit: number,
): THREE.DataTexture {
  const data = new Uint16Array(w * h);
  bakeSdfData(mask, data, w, h, texelsPerUnit);
  const texture = new THREE.DataTexture(data, w, h, THREE.RedFormat, THREE.HalfFloatType);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** Réécrit les distances d'une texture SDF existante (recuit : harmoniques réglées en live). */
export function rebakeFieldTexture(
  texture: THREE.DataTexture,
  mask: Uint8Array,
  texelsPerUnit: number,
): void {
  bakeSdfData(
    mask,
    texture.image.data as Uint16Array,
    texture.image.width,
    texture.image.height,
    texelsPerUnit,
  );
  texture.needsUpdate = true;
}

/* --------------------- Masques : patatoïde harmonique, SVG fermé --------------------- */

function scratchCanvas(res: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null;
} {
  return scratchRectCanvas(res, res);
}

function scratchRectCanvas(
  w: number,
  h: number,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D | null } {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  return { canvas, ctx };
}

/**
 * Patatoïde harmonique courant (amplitudes H, phases de la variante),
 * recuit en masque. Legacy carré : domaine [-SPAN, SPAN], rayon aura
 * besoin de uShapeScale = baseRadius / INK_BAKE_BASE au rendu.
 */
export function harmonicMask(variant: number, harm: number): Uint8Array | null {
  const res = FIELD_RES;
  const { canvas, ctx } = scratchCanvas(res);
  if (!ctx) return null;
  const ph = shapeSeed(variant);
  ctx.beginPath();
  const steps = 720;
  for (let i = 0; i <= steps; i++) {
    const th = (i / steps) * Math.PI * 2;
    const wobble =
      HARMONIC_AMPLITUDES[0] * Math.sin(3 * th + ph.x) +
      HARMONIC_AMPLITUDES[1] * Math.sin(2 * th - ph.y) +
      HARMONIC_AMPLITUDES[2] * Math.sin(5 * th + ph.z) +
      HARMONIC_AMPLITUDES[3] * Math.sin(7 * th - ph.w);
    const rWorld = INK_BAKE_BASE * (1 + harm * wobble);
    const r = (rWorld / FIELD_SPAN) * (res / 2);
    const x = res / 2 + Math.cos(th) * r;
    const y = res / 2 - Math.sin(th) * r; // canvas : y vers le bas
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = "#fff";
  ctx.fill();
  return readMask(ctx, res, res);
}

/**
 * Patatoïde harmonique en espace ÉCRAN : grille rectangulaire W×H dont
 * les texels sont carrés en unités monde (1 unité = hauteur écran), le
 * rayon est pris en unités demi-hauteur (baseRadius). Pas d'échelle
 * live au rendu (uShapeScale = 1) : le recuit porte la taille courante.
 */
export function harmonicMaskScreen(
  variant: number,
  harm: number,
  baseRadius: number,
  w: number,
  h: number,
): Uint8Array | null {
  const { ctx } = scratchRectCanvas(w, h);
  if (!ctx) return null;
  const ph = shapeSeed(variant);
  ctx.beginPath();
  const steps = 720;
  // 1 unité monde = h texels (hauteur écran pleine = 1.0).
  for (let i = 0; i <= steps; i++) {
    const th = (i / steps) * Math.PI * 2;
    const wobble =
      HARMONIC_AMPLITUDES[0] * Math.sin(3 * th + ph.x) +
      HARMONIC_AMPLITUDES[1] * Math.sin(2 * th - ph.y) +
      HARMONIC_AMPLITUDES[2] * Math.sin(5 * th + ph.z) +
      HARMONIC_AMPLITUDES[3] * Math.sin(7 * th - ph.w);
    const r = baseRadius * (1 + harm * wobble) * h;
    const x = w / 2 + Math.cos(th) * r;
    const y = h / 2 - Math.sin(th) * r; // canvas : y vers le bas
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = "#fff";
  ctx.fill();
  return readMask(ctx, w, h);
}

export type ScreenMask = { mask: Uint8Array; w: number; h: number };

/**
 * SVG fermé (canvas 1000×1000 — l'export de l'outil sculpt) recuit en
 * espace ÉCRAN : le domaine SVG complet [0..1000]² est étiré sur le
 * rectangle W×H (l'écran). Le coin haut droit du SVG (1000, 0) tombe
 * sur le coin haut droit de l'écran ; les sous-chemins à sens inverse
 * font des trous (fill-rule du moteur de rendu). Renvoie aussi l'image
 * chargée pour re-rastériser au changement d'aspect.
 */
export function rasterizeSvgScreen(img: HTMLImageElement, w: number, h: number): ScreenMask | null {
  const { ctx } = scratchRectCanvas(w, h);
  if (!ctx) return null;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const mask = readMask(ctx, w, h);
  return mask ? { mask, w, h } : null;
}

export function loadSvgElement(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
