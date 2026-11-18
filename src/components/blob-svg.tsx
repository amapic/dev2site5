import { useEffect, useId, useRef } from "react";
import { INK_SHAPE_URLS } from "@/components/ink-shapes";
import { shapeSeed } from "@/components/ink-shape-field";
import { loadSvgElement } from "@/components/ink-shape-field";

/* ------------------------------------------------------------------ */
/* Patatoïde SVG — même rendu que le shader (ink-blob-image) mais      */
/* sans WebGL : deux contours (forme de départ, forme d'arrivée)       */
/* interpolés angle par angle, tracés en <path> qui sert à la fois de  */
/* clip-path (photo + HTML React dans un <foreignObject>) et de liseré */
/* gris (trait). Le morphing suit l'attribut data-ink-morph écrit par  */
/* la chorégraphie GSAP sur .project-slide.                            */
/* ------------------------------------------------------------------ */

// Réglages figés (les curseurs du HUD n'existent plus ici) : mêmes valeurs
// par défaut que inkEdgeSettings — rayon 0.49 (unité = demi-hauteur du cadre),
// irrégularité harmonique 0.3, encres du liseré identiques.
const BASE_RADIUS = 0.49;
const HARM = 0.3;
const HARMONICS = [0.11, 0.07, 0.05, 0.03] as const;
const END_VARIANT_OFFSET = 7;
const INK = "#3b4a63";

// Échantillons du contour : assez pour un bord lisse, peu pour un path pas cher.
const N = 360;

// Contour en coordonnées polaires : rayon par angle, unité = demi-hauteur,
// centre (0,0). Forme harmonique : les mêmes équations que le recuit du shader.
function harmonicOutline(variant: number): Float64Array {
  const ph = shapeSeed(variant);
  const out = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const th = (i / N) * Math.PI * 2;
    const wobble =
      HARMONICS[0] * Math.sin(3 * th + ph.x) +
      HARMONICS[1] * Math.sin(2 * th - ph.y) +
      HARMONICS[2] * Math.sin(5 * th + ph.z) +
      HARMONICS[3] * Math.sin(7 * th - ph.w);
    out[i] = BASE_RADIUS * (1 + HARM * wobble);
  }
  return out;
}

// Contour d'un SVG sculpté : le domaine SVG complet est étiré sur le cadre
// (même mapping que le shader), rastérisé une fois, puis le bord extérieur
// est sondé en rayons depuis le centre. Les trous sont ignorés (bord externe).
async function carveOutline(url: string, aspect: number): Promise<Float64Array | null> {
  const img = await loadSvgElement(url);
  if (!img) return null;
  const h = 720;
  const w = Math.max(64, Math.round(h * aspect));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return null;
  }
  const out = new Float64Array(N);
  const cx = w / 2;
  const cy = h / 2;
  const maxR = Math.hypot(cx, cy);
  for (let i = 0; i < N; i++) {
    const th = (i / N) * Math.PI * 2;
    const dx = Math.cos(th);
    const dy = -Math.sin(th); // canvas : y vers le bas
    let r = 0;
    for (let d = maxR; d >= 1; d -= 1.5) {
      const px = Math.round(cx + dx * d);
      const py = Math.round(cy + dy * d);
      if (px < 0 || py < 0 || px >= w || py >= h) continue;
      if (data[(py * w + px) * 4 + 3]! > 40) {
        r = d;
        break;
      }
    }
    out[i] = r / (h / 2);
  }
  return out;
}

// La même équation d'adoucissement que le shader (morphEase).
const morphEase = (t: number) => t * t * (3 - 2 * t);

// Épaisseur moyenne du trait d'une écriture manuscrite, fraction de la
// taille de police (Caveat et proches : ~5 % de l'em). Le texte manuscrit
// du fond mesure clamp(28px, 5vw, 72px) : le liseré est calibré dessus.
const TEXT_FONT_CLAMP_MIN = 28;
const TEXT_FONT_CLAMP_MAX = 72;
const TEXT_FONT_VW = 0.05;
const TEXT_STROKE_EM = 0.05;
const textStrokePx = () => {
  const fontPx = Math.min(
    TEXT_FONT_CLAMP_MAX,
    Math.max(TEXT_FONT_CLAMP_MIN, window.innerWidth * TEXT_FONT_VW),
  );
  return fontPx * TEXT_STROKE_EM;
};

/**
 * Patatoïde SVG : la photo (rognée cover) et le HTML React passé en enfant
 * (dans <foreignObject> — pas d'attribut xmlns à écrire) sont découpés par
 * le contour courant ; le liseré gris suit le même contour. Utilisation :
 *
 *   <BlobSvg src alt variant>
 *     <div className="project-details">…</div>
 *   </BlobSvg>
 */
export function BlobSvg({
  src,
  alt,
  variant = 0,
  children,
}: {
  src: string;
  alt: string;
  variant?: number;
  children?: React.ReactNode;
}) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const clipPathRef = useRef<SVGPathElement>(null);
  const strokePathRef = useRef<SVGPathElement>(null);
  const clipId = `blob-clip-${useId()}`;

  useEffect(() => {
    const host = hostRef.current;
    const svg = svgRef.current;
    const clipPath = clipPathRef.current;
    const strokePath = strokePathRef.current;
    if (!host || !svg || !clipPath || !strokePath) return;

    const blob = host.closest(".project-blob");
    const slide = host.closest<HTMLElement>(".project-slide");
    // SVG sculpté pour cette variante → slide plein écran (mode écran du shader).
    const overrides = INK_SHAPE_URLS[variant] ?? {};
    const screenMode = !!(overrides.start || overrides.end);
    blob?.classList.add("ink-shaped");
    if (screenMode) slide?.classList.add("ink-screen");

    let disposed = false;
    let aspect = 1;
    // Contours courant : au départ les harmoniques, remplacés par les carve
    // SVG dès qu'ils sont prêts (échec → harmoniques conservés).
    let from = harmonicOutline(variant);
    let to = harmonicOutline(variant + END_VARIANT_OFFSET);

    const setViewBox = () => {
      svg.setAttribute("viewBox", `${-aspect} -1 ${2 * aspect} 2`);
    };

    // Largeur du liseré en unités du cadre (1 unité = demi-hauteur → 2 unités
    // = hauteur du cadre en px) : le trait rendu vaut textStrokePx() pixels,
    // l'épaisseur moyenne du trait du texte manuscrit du fond.
    const updateStroke = () => {
      const h = host.clientHeight || 1;
      strokePath.setAttribute("stroke-width", ((2 * textStrokePx()) / h).toFixed(5));
    };

    // Path « d » du contour mixé — reconstruit seulement quand le morph bouge.
    let lastM = -1;
    const pathD = (m: number): string => {
      const parts = new Array<string>(N);
      for (let i = 0; i < N; i++) {
        const th = (i / N) * Math.PI * 2;
        const a = from[i] ?? 0;
        const b = to[i] ?? a;
        const r = a + (b - a) * m;
        const x = (Math.cos(th) * r).toFixed(4);
        const y = (-Math.sin(th) * r).toFixed(4); // y écran vers le bas
        parts[i] = `L${x} ${y}`;
      }
      if (!parts[0]) return "";
      parts[0] = `M${parts[0].slice(1)}`;
      return `${parts.join("")}Z`;
    };

    const applyMorph = () => {
      const attr = host.closest<HTMLElement>("[data-ink-morph]")?.dataset["inkMorph"];
      const raw = attr !== undefined && attr !== "" ? Number.parseFloat(attr) : 0;
      const m = morphEase(raw);
      if (m === lastM) return;
      const d = pathD(m);
      clipPath.setAttribute("d", d);
      strokePath.setAttribute("d", d);
      lastM = m;
    };

    // Recarve des contours (SVG sculptés seulement) après un changement d'aspect.
    let carveTimer = 0;
    const scheduleCarve = () => {
      window.clearTimeout(carveTimer);
      carveTimer = window.setTimeout(async () => {
        if (disposed) return;
        const next = await Promise.all([
          overrides.start ? carveOutline(overrides.start!, aspect) : null,
          overrides.end ? carveOutline(overrides.end!, aspect) : null,
        ]);
        if (disposed) return;
        if (next[0]) from = next[0];
        if (next[1]) to = next[1];
        lastM = -1;
        applyMorph();
      }, 250);
    };

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect || !rect.width || !rect.height) return;
      const next = rect.width / rect.height;
      updateStroke();
      if (Math.abs(next - aspect) < 0.001) return;
      aspect = next;
      setViewBox();
      if (screenMode) scheduleCarve(); // le carve dépend de l'aspect du cadre
      lastM = -1;
      applyMorph();
    });
    observer.observe(host);
    aspect = host.clientWidth && host.clientHeight ? host.clientWidth / host.clientHeight : 1;
    setViewBox();
    updateStroke();
    applyMorph();

    if (screenMode) scheduleCarve(); // premier carve des SVG sculptés

    // La taille de police du texte manuscrit suit la largeur de la fenêtre :
    // le liseré est recalculé à chaque resize de fenêtre aussi.
    window.addEventListener("resize", updateStroke);

    let raf = 0;
    const tick = () => {
      applyMorph();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(carveTimer);
      window.removeEventListener("resize", updateStroke);
      observer.disconnect();
      blob?.classList.remove("ink-shaped");
      slide?.classList.remove("ink-screen");
    };
  }, [src, variant, clipId]);

  return (
    <span ref={hostRef} className="ink-blob" role="img" aria-label={alt}>
      <svg ref={svgRef} viewBox="-1 -1 2 2" style={{ pointerEvents: "none" }} aria-hidden="true">
        <defs>
          <clipPath id={clipId}>
            <path ref={clipPathRef} d="M0 0" />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          {/* Photo recadrée « cover » sur tout le cadre (comme le shader) */}
          <image
            href={src}
            x="0%"
            y="0%"
            width="100%"
            height="100%"
            preserveAspectRatio="xMidYMid slice"
          />
          {/* Contenu HTML React normal, découpé par la forme qui morphe */}
          <foreignObject x="0%" y="0%" width="100%" height="100%">
            {children}
          </foreignObject>
        </g>
        {/* Liseré gris : le même trait marque la limite courante (départ ou arrivée) */}
        <path
          ref={strokePathRef}
          d="M0 0"
          fill="none"
          stroke={INK}
          strokeWidth={0.006}
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
