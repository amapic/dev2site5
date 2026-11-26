import { useEffect, useRef, useState } from "react";
import { Moon, Sun } from "lucide-react";

// Composants internes exportés côté page : titre/sous-titre
export type CacheSceneCopy = {
  eyebrow: string;
  title: string;
  lede: string;
};

type Props = {
  forwardSrc: string; // vidéo de fond (aller)
  reverseSrc: string; // copie inversée (retour, ffmpeg -vf reverse)
  speed?: number; // vitesse de lecture (aller ET retour)
  maskWidth?: number; // largeur d'analyse du masque (basse résolution)
  softness?: number; // bande de transition du score R-B
  nightToggle?: boolean; // bouton 🌙 : fait glisser la scène vers la nuit
  night?: boolean; // nuit pilotée de l'extérieur (ex : section discrétion à l'écran)
} & CacheSceneCopy;

const DEFAULT_SPEED = 1;
const DEFAULT_MASK_W = 256;
const DEFAULT_SOFTNESS = 16;

/* Scene « cache eau/sable » — cf. les commentaires de src/routes/cache.tsx :
   fond vidéo en ping-pong, titraille au-dessus, et un canvas qui redessine la
   frame courante avant de la découper (destination-in) par un masque calculé
   en direct : R - B > 0 = sable (transparent), ≤ 0 = eau (opaque). Le masque
   est calculé sur LA frame affichée, donc la synchro est structurelle. */
export function CacheMaskScene({
  forwardSrc,
  reverseSrc,
  speed = DEFAULT_SPEED,
  maskWidth = DEFAULT_MASK_W,
  softness = DEFAULT_SOFTNESS,
  nightToggle = false,
  night: nightProp = false,
  eyebrow,
  title,
  lede,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const bgFwdRef = useRef<HTMLVideoElement>(null); // aller
  const bgRevRef = useRef<HTMLVideoElement>(null); // retour
  const canvasRef = useRef<HTMLCanvasElement>(null); // compositing final
  // Mode nuit : la cible (0/1) vient du bouton OU du prop « night » (nuit
  // pilotée de l'extérieur) ; le facteur glisse en douceur dans la boucle
  // d'affichage (fondu progressif, pas de switch sec).
  const [selfNight, setSelfNight] = useState(false);
  const isNight = selfNight || nightProp;
  const nightTargetRef = useRef(0);
  const nightRef = useRef(0);
  useEffect(() => {
    nightTargetRef.current = isNight ? 1 : 0;
  }, [isNight]);

  useEffect(() => {
    const stage = stageRef.current;
    const fwd = bgFwdRef.current;
    const rev = bgRevRef.current;
    const canvas = canvasRef.current;
    if (!stage || !fwd || !rev || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Canvas d'analyse : copie basse résolution de la frame courante, où le
    // masque sable/eau est calculé avant d'être appliqué en grand.
    const off = document.createElement("canvas");
    const offCtx = off.getContext("2d", { willReadFrequently: true });
    if (!offCtx) return;

    let raf = 0;
    let stopped = false;
    let dir: "fwd" | "rev" = "fwd";

    // Object-fit: cover calculé à la main pour drawImage
    const cover = (vw: number, vh: number, w: number, h: number) => {
      const s = Math.max(w / vw, h / vh);
      return { dx: (w - vw * s) / 2, dy: (h - vh * s) / 2, dw: vw * s, dh: vh * s };
    };

    // Ping-pong : au bout de l'aller on passe à la copie inversée (rembobinée
    // à 0, même vitesse, opacité échangée), et réciproquement.
    const swapTo = (next: "fwd" | "rev") => {
      if (next === dir) return;
      const from = dir === "fwd" ? fwd : rev;
      const to = next === "fwd" ? fwd : rev;
      from.pause();
      to.currentTime = 0;
      to.playbackRate = speed;
      to.style.opacity = "1";
      from.style.opacity = "0";
      void to.play();
      dir = next;
    };
    fwd.addEventListener("ended", () => swapTo("rev"));
    rev.addEventListener("ended", () => swapTo("fwd"));

    // Démarrage : dès que l'aller est lisible, frame 0, vitesse commune, go.
    const start = () => {
      fwd.currentTime = 0;
      fwd.playbackRate = speed;
      void fwd.play();
    };
    if (fwd.readyState >= 3) start();
    else fwd.addEventListener("canplay", start, { once: true });

    const frame = () => {
      if (stopped) return;
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pxW = Math.round(w * dpr);
      const pxH = Math.round(h * dpr);
      if (canvas.width !== pxW || canvas.height !== pxH) {
        canvas.width = pxW;
        canvas.height = pxH;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Facteur nuit qui glisse vers sa cible (bouton 🌙 / ☀️)
      const nTarget = nightTargetRef.current;
      nightRef.current += (nTarget - nightRef.current) * 0.05;
      const nf = nightRef.current < 0.005 ? 0 : nightRef.current;

      const cur = dir === "fwd" ? fwd : rev;
      if (cur.readyState >= 2) {
        const vw = cur.videoWidth || 1280;
        const vh = cur.videoHeight || 720;
        const sw = maskWidth;
        const sh = Math.max(1, Math.round((maskWidth * vh) / vw));
        if (off.width !== sw || off.height !== sh) {
          off.width = sw;
          off.height = sh;
        }

        // 1 · Analyse de la frame : masque d'alpha eau (1) / sable (0)
        // (calculé sur les couleurs BRUTES de la vidéo, sans grade)
        offCtx.drawImage(cur, 0, 0, sw, sh);
        const img = offCtx.getImageData(0, 0, sw, sh);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          // score = R - B : > 0 sable (transparent), ≤ 0 eau (opaque).
          const r = d[i] ?? 0;
          const b = d[i + 2] ?? 0;
          let a = 0.5 - (r - b) / softness;
          a = a <= 0 ? 0 : a >= 1 ? 1 : a;
          d[i] = d[i + 1] = d[i + 2] = 255; // rgb sans importance pour destination-in
          d[i + 3] = a * 255;
        }
        offCtx.putImageData(img, 0, 0);

        // 2 · La vidéo de fond recadrée en cover — identique au <video> du dessous
        const pos = cover(vw, vh, w, h);
        // Passe nuit sur la frame : assombrie, désaturée, refroidie.
        // Le masque (destination-in) n'utilise que l'alpha : appliquer le
        // grade AVANT la découpe est sûr, les zones rejetées disparaissent.
        if (nf > 0) {
          ctx.filter = `brightness(${(1 - 0.62 * nf).toFixed(3)}) saturate(${(1 - 0.45 * nf).toFixed(3)}) contrast(${(1 + 0.08 * nf).toFixed(3)})`;
        }
        ctx.drawImage(cur, pos.dx, pos.dy, pos.dw, pos.dh);
        ctx.filter = "none";

        // 3 · Teinte lunaire : multiplication bleu nuit + reflet de lune
        if (nf > 0) {
          ctx.globalCompositeOperation = "multiply";
          ctx.fillStyle = `rgba(14, 26, 58, ${(0.85 * nf).toFixed(3)})`;
          ctx.fillRect(0, 0, w, h);
          ctx.globalCompositeOperation = "screen";
          const glintR = Math.max(w, h) * 0.75;
          const glint = ctx.createRadialGradient(w * 0.72, h * 0.25, 0, w * 0.72, h * 0.25, glintR);
          glint.addColorStop(0, `rgba(200, 220, 255, ${(0.22 * nf).toFixed(3)})`);
          glint.addColorStop(1, "rgba(0, 0, 0, 0)");
          ctx.fillStyle = glint;
          ctx.fillRect(0, 0, w, h);
          ctx.globalCompositeOperation = "source-over";
          // Vignette : bords plus sombres, ambiance clair-obscur
          const vig = ctx.createRadialGradient(
            w / 2,
            h / 2,
            Math.min(w, h) * 0.35,
            w / 2,
            h / 2,
            Math.max(w, h) * 0.75,
          );
          vig.addColorStop(0, "rgba(0, 0, 0, 0)");
          vig.addColorStop(1, `rgba(0, 4, 16, ${(0.55 * nf).toFixed(3)})`);
          ctx.fillStyle = vig;
          ctx.fillRect(0, 0, w, h);
        }

        // 4 · Découpe par le masque fraîchement calculé (upscale lissé)
        ctx.globalCompositeOperation = "destination-in";
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(off, pos.dx, pos.dy, pos.dw, pos.dh);
        ctx.globalCompositeOperation = "source-over";
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, [forwardSrc, reverseSrc, speed, maskWidth, softness]);

  return (
    <div className={`cache-stage${isNight ? " is-night" : ""}`} ref={stageRef}>
      {/* 1 · Fond : la vidéo, en ping-pong (aller + retour) */}
      <video
        ref={bgFwdRef}
        className="cache-bg"
        src={forwardSrc}
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
      />
      <video
        ref={bgRevRef}
        className="cache-bg"
        src={reverseSrc}
        muted
        playsInline
        preload="auto"
        style={{ opacity: 0 }}
        aria-hidden="true"
      />
      {/* 2 · Le texte que le masque révèle ou masque */}
      <div className="cache-contenu">
        <div className="cache-titling">
          <p className="cache-eyebrow">{eyebrow}</p>
          <h1 className="cache-title">{title}</h1>
          <p className="cache-lede">{lede}</p>
        </div>
      </div>
      <canvas ref={canvasRef} className="cache-overlay" aria-hidden="true" />
      {nightToggle && (
        <button
          type="button"
          className="cache-night-btn"
          aria-pressed={isNight}
          onClick={() => setSelfNight((v) => !v)}
        >
          {isNight ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
          <span>{isNight ? "Jour" : "Nuit"}</span>
        </button>
      )}
    </div>
  );
}
