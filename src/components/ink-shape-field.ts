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
  res: number,
): void {
  let k = 0;
  v[0] = 0;
  z[0] = -SDF_INF;
  z[1] = SDF_INF;
  for (let q = 1; q < res; q++) {
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
  for (let q = 0; q < res; q++) {
    while ((z[k + 1] ?? 0) < q) k++;
    const vk = v[k] ?? 0;
    d[q] = (q - vk) * (q - vk) + (f[vk] ?? SDF_INF);
  }
}

function edt2d(grid: Float64Array, res: number): void {
  const f = new Float64Array(res);
  const d = new Float64Array(res);
  const v = new Int32Array(res);
  const z = new Float64Array(res + 1);
  let rowStart = 0;
  while (rowStart < res * res) {
    for (let x = 0; x < res; x++) f[x] = grid[rowStart + x] ?? SDF_INF;
    edt1d(f, d, v, z, res);
    for (let x = 0; x < res; x++) grid[rowStart + x] = d[x] ?? SDF_INF;
    rowStart += res;
  }
  for (let x = 0; x < res; x++) {
    for (let y = 0; y < res; y++) f[y] = grid[y * res + x] ?? SDF_INF;
    edt1d(f, d, v, z, res);
    for (let y = 0; y < res; y++) grid[y * res + x] = d[y] ?? SDF_INF;
  }
}

/* --------------------- Rasterisation : masque binaire → texture SDF --------------------- */

function readMask(ctx: CanvasRenderingContext2D, res: number): Uint8Array | null {
  const img = ctx.getImageData(0, 0, res, res).data;
  const mask = new Uint8Array(res * res);
  let count = 0;
  for (let i = 0; i < mask.length; i++) {
    const inside = (img[i * 4 + 3] ?? 0) >= 100 ? 1 : 0;
    mask[i] = inside;
    count += inside;
  }
  // Rien dans le masque (SVG vide, image manquante…) : la forme est ignorée.
  return count > 4 ? mask : null;
}

/** Remplit un buffer de demi-floats avec la distance signée du masque (unités monde). */
function bakeSdfData(mask: Uint8Array, out: Uint16Array): void {
  const n = FIELD_RES * FIELD_RES;
  const nearInside = new Float64Array(n);
  const nearOutside = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    nearInside[i] = mask[i] ? 0 : SDF_INF; // sources = pixels intérieurs
    nearOutside[i] = mask[i] ? SDF_INF : 0; // sources = pixels extérieurs
  }
  edt2d(nearInside, FIELD_RES);
  edt2d(nearOutside, FIELD_RES);

  // 1 texel = 2 * SPAN unités monde ; distance signée : + à l'intérieur
  // (distance au bord le plus proche mesurée côté extérieur), − dehors.
  const unit = (2 * FIELD_SPAN) / FIELD_RES;
  for (let i = 0; i < n; i++) {
    const dist = mask[i]
      ? Math.sqrt(nearOutside[i] ?? SDF_INF)
      : -Math.sqrt(nearInside[i] ?? SDF_INF);
    out[i] = THREE.DataUtils.toHalfFloat(Math.max(-FIELD_SPAN, Math.min(FIELD_SPAN, dist * unit)));
  }
}

/** Renvoie un DataTexture R16F : distance signée en unités monde (positif intérieur). */
export function maskToFieldTexture(mask: Uint8Array): THREE.DataTexture {
  const data = new Uint16Array(FIELD_RES * FIELD_RES);
  bakeSdfData(mask, data);
  const texture = new THREE.DataTexture(
    data,
    FIELD_RES,
    FIELD_RES,
    THREE.RedFormat,
    THREE.HalfFloatType,
  );
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** Réécrit les distances d'une texture SDF existante (recuit : harmoniques réglées en live). */
export function rebakeFieldTexture(texture: THREE.DataTexture, mask: Uint8Array): void {
  bakeSdfData(mask, texture.image.data as Uint16Array);
  texture.needsUpdate = true;
}

/* --------------------- Masques : patatoïde harmonique, SVG fermé --------------------- */

function scratchCanvas(res: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null;
} {
  const canvas = document.createElement("canvas");
  canvas.width = res;
  canvas.height = res;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  return { canvas, ctx };
}

/** Patatoïde harmonique courant (amplitudes H, phases de la variante), recuit en masque. */
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
  return readMask(ctx, res);
}

/**
 * SVG fermé (canvas 1000×1000 — l'export de l'outil sculpt) → masque binaire.
 * Le SVG est mappé sur le domaine complet [-SPAN, SPAN] : à l'échelle de
 * base (uShapeScale = 1), 1000px SVG = 1.8 unité monde de côté. Les trous
 * (sous-chemins à sens inverse) sont signés par le moteur de remplissage.
 */
export function maskFromImageElement(img: HTMLImageElement): Uint8Array | null {
  const res = FIELD_RES;
  const { ctx } = scratchCanvas(res);
  if (!ctx) return null;
  ctx.clearRect(0, 0, res, res);
  ctx.drawImage(img, 0, 0, res, res);
  return readMask(ctx, res);
}

export function loadSvgMask(url: string): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(maskFromImageElement(img));
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
