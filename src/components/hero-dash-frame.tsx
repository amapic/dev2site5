import { useEffect, useState } from "react";
import { prefersReducedMotion } from "@/hooks/use-smooth-scroll";

// Cadre de pointillés « à la main » qui fait le tour de l'écran, avec un blanc
// en haut à gauche pour laisser la place au hero rangé en médaillon (fin de la
// chorégraphie du use-hero-scroll : left 4% / top 6% / scale 0.3 transformé sur
// un hero plein écran, soit 4%+30% de large et 6%+30% de haut + marge).
// Chaque tiret est un ruban vectoriel échantillonné le long du chemin du cadre :
// la torsion est une fonction CONTINUE de la distance (somme de sinus), donc un
// tiret est penché dans la même direction que ses voisins — et ses extrémités
// suivent la direction du chemin au point de coupe (arc de coin inclus), ce qui
// les fait « pointer » naturellement vers le tiret suivant. Pas de filtre
// SVG displacement (qui crénele) : le rendu reste un contour lisse et
// antialiasé à toutes les DPI.
const STROKE = 20; // épaisseur d'un tiret
const PATH_TILT = 0.04; // amplitude de la torsion continue (radians)
const WIDTH_BREATH = 0.08; // respiration d'épaisseur le long du chemin (× mi-épaisseur)
const TIP_SLIP = 0.1; // petit glissement aléatoire des extrémités (× épaisseur)
const SAMPLES = 5; // échantillons du ruban par tiret (courbure du trait)
const SEED = 2026;

type Point = { x: number; y: number };

const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Point, k: number): Point => ({ x: a.x * k, y: a.y * k });
const rot = (v: Point, a: number): Point => ({
  x: v.x * Math.cos(a) - v.y * Math.sin(a),
  y: v.x * Math.sin(a) + v.y * Math.cos(a),
});
const norm = (v: Point): Point => {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
};

// Torsion continue le long du chemin : continue en s, donc deux tirets voisins
// sont penchés de façon cohérente (sensation de flux, pas de tirets « droits »
// à contre-sens les uns des autres).
function pathTilt(s: number, dash: number) {
  return (
    PATH_TILT * Math.sin((s / dash) * 1.7 + 1.3) +
    PATH_TILT * 0.6 * Math.sin((s / dash) * 3.1 + 4.2)
  );
}

// PRNG déterministe (mulberry32) : les tirets restent identiques d'un render à l'autre
function mulberry32(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function HeroDashFrame() {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    setEnabled(!prefersReducedMotion());
    const measure = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const { w, h } = size;
  if (!enabled || w === 0 || h === 0) return null;

  // Cadre en retrait des bords
  const inset = Math.min(26, Math.max(16, Math.round(w * 0.016)));
  const x0 = inset;
  const y0 = inset;
  const x1 = w - inset;
  const y1 = h - inset;

  // Emprise du médaillon (4% + 30% de large, 6% + 30% de haut) + marge de respiration
  const gapEndX = Math.round(w * 0.37); // fin du trou sur le bord haut
  const gapEndY = Math.round(h * 0.39); // fin du trou sur le bord gauche

  // Le haut doit contenir ~5 tirets : 5 dashes + 4 gaps couvrent le segment
  // (gap ≈ 0.65 × dash → 5 × dash + 4 × gap ≈ 7.6 × dash = longueur du haut).
  const topLen = Math.max(0, x1 - gapEndX);
  const dash = topLen / 7.6;
  const gap = dash * 0.65;
  const step = dash + gap;

  // Le chemin du cadre : segments rectilignes + coins en arc de rayon r.
  // at(t) échantillonne un point + la direction du parcours à la distance t.
  const r = 16;
  const segments: { len: number; at: (t: number) => { p: Point; dir: Point } }[] = [];
  const seg = (from: Point, to: Point) => {
    const len = Math.hypot(to.x - from.x, to.y - from.y);
    segments.push({
      len,
      at: (t) => ({
        p: { x: from.x + ((to.x - from.x) * t) / len, y: from.y + ((to.y - from.y) * t) / len },
        dir: norm({ x: to.x - from.x, y: to.y - from.y }),
      }),
    });
  };
  const arc = (cx: number, cy: number, a0: number, a1: number) => {
    const len = r * Math.abs(a1 - a0);
    segments.push({
      len,
      at: (t) => {
        const a = a0 + (a1 - a0) * (t / len);
        // Tangente = direction du parcours (sens horaire, a croissant)
        return {
          p: { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) },
          dir: { x: -Math.sin(a), y: Math.cos(a) },
        };
      },
    });
  };

  seg({ x: gapEndX, y: y0 }, { x: x1 - r, y: y0 }); // haut →
  arc(x1 - r, y0 + r, -Math.PI / 2, 0); // coin haut droit ↘
  seg({ x: x1, y: y0 + r }, { x: x1, y: y1 - r }); // droit ↓
  arc(x1 - r, y1 - r, 0, Math.PI / 2); // coin bas droit ↙
  seg({ x: x1 - r, y: y1 }, { x: x0 + r, y: y1 }); // bas ←
  arc(x0 + r, y1 - r, Math.PI / 2, Math.PI); // coin bas gauche ↖
  seg({ x: x0, y: y1 - r }, { x: x0, y: gapEndY }); // gauche ↑

  const totalLen = segments.reduce((s, v) => s + v.len, 0);
  const last = segments[segments.length - 1];
  if (!last) return null;
  const pointAt = (dist: number): { p: Point; dir: Point } => {
    let rest = dist;
    for (const s of segments) {
      if (rest <= s.len) return s.at(rest);
      rest -= s.len;
    }
    return last.at(last.len);
  };

  // Pose des tirets : chaque tiret est un ruban échantillonné (SAMPLES points)
  // le long du chemin, tangente tournée de la torsion CONTINUE pathTilt(s), et
  // extrémités glissées légèrement dans l'axe (TIP_SLIP, aléa déterministe très
  // léger fondu sur un quart du tiret, qui ne casse pas la continuité d'ensemble).
  const rng = mulberry32(SEED);
  const halfW = STROKE / 2;
  const tipAmp = STROKE * TIP_SLIP;
  const f = (v: Point) => `${v.x.toFixed(2)} ${v.y.toFixed(2)}`;
  let d = "";
  for (let s = 0; s + dash <= totalLen; s += step) {
    const slipStart = (rng() * 2 - 1) * tipAmp;
    const slipEnd = (rng() * 2 - 1) * tipAmp;
    const left: Point[] = [];
    const right: Point[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const u = (i / (SAMPLES - 1)) * dash;
      const { p, dir } = pointAt(s + u);
      // Tangente = direction du chemin au point + torsion continue ;
      // aux coins, le changement de direction du chemin lui-même courbe le
      // tiret, donc son extrémité vise déjà le tiret suivant.
      const tan = rot(dir, pathTilt(s + u, dash));
      const perp = { x: -tan.y, y: tan.x };
      // Épaisseur qui « respire » doucement le long du chemin
      const hw = halfW * (1 + WIDTH_BREATH * Math.sin(((s + u) / dash) * 2.9 + 2));
      // Glissement aléatoire aux extrémités seulement (fondu sur 1/4 du tiret)
      const slip =
        u < dash * 0.25
          ? slipStart * (1 - u / (dash * 0.25))
          : u > dash * 0.75
            ? slipEnd * (1 - (dash - u) / (dash * 0.25))
            : 0;
      left.push(add(add(p, mul(perp, hw)), mul(tan, slip)));
      right.push(add(add(p, mul(perp, -hw)), mul(tan, slip)));
    }
    let sub = "";
    left.forEach((v, i) => {
      sub += `${i === 0 ? "M" : "L"} ${f(v)} `;
    });
    right.reverse().forEach((v) => {
      sub += `L ${f(v)} `;
    });
    d += `${sub}Z `;
  }

  return (
    <svg
      className="hero-dash-frame"
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden="true"
    >
      <path d={d} fill="var(--foreground)" />
    </svg>
  );
}
