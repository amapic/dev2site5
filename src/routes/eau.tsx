import { useEffect, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { meta } from "@/components/portfolio";
import { prefersReducedMotion } from "@/hooks/use-smooth-scroll";

export const Route = createFileRoute("/eau")({
  head: () =>
    meta(
      "Eau — Labo",
      "Démo : la vidéo eau-seule (sable transparent) en fond, à l'arrêt ; le scroll avance la vidéo image par image — la marée se retire et révèle le titre sous la plage.",
    ),
  component: WaterScrubPage,
});

/* ------------------------------------------------------------------ */
/* DEMO « SCRUB EAU » (/eau) — la vidéo eau-leger.webm (fabriquée par  */
/* water_only.py --scale 960 --keyint 12 : eau visible, sable alpha 0, */
/* keyframes toutes les 12 frames pour un seek rapide) est posée en    */
/* fond, EN PAUSE. Le scroll ne déplace pas la page : il scrubbe la    */
/* vidéo.                                                              */
/*   progress = scrollY / (hauteur scrollable)                         */
/*   frame   = round(progress × nb total de frames) / fps              */
/* et la vidéo SUIT cette cible par une poursuite amortie : inertie au */
/* départ (la vitesse met quelques ticks à monter), aucun dépassement  */
/* de la cible — les frames continuent de rouler après l'arrêt du      */
/* scroll, puis se posent sans oscillation.                            */
/* Chaque cran de scroll fait passer quelques frames (quantifiées à    */
/* 24 i/s pour un vrai pas d'images, pas un glissement de pastilles).  */
/* La vidéo porte un canal alpha : le titre est posé SOUS la vidéo —   */
/* quand l'eau reflue (au fil du scroll), le sable devient transparent */
/* et le titre affleure. Même idée que /cache, mais en un seul calque. */
/* prefers-reduced-motion : la page défile normalement, la vidéo       */
/* reste à sa première image.                                          */
/* ------------------------------------------------------------------ */

const SEQ_FPS = 24; // a.mp4 et eau.webm tournent à 24 i/s
const SCROLL_PAGES = 4; // la piste de scroll vaut 4 écrans (3 écrans de course)

// Poursuite du scrub : la vidéo rattrape la cible du scroll avec de
// l'inertie au départ et sans dépassement (paramètres validés en
// simulation : zéro oscillation, 50 % de la course en ~0,35 s, vitesse
// maximale atteinte vers le 11e tick — le démarrage est progressif).
const FOLLOW_GAIN = 0.01; // accélération : fraction de l'écart convertie en vitesse par tick
const FOLLOW_DRAG = 0.84; // frottement par tick ; avec ce gain, jamais de dépassement
const SETTLE_EPSILON = 0.0005; // on se déclare immobile sous cet écart (en fraction de durée)

function WaterScrubPage() {
  const trackRef = useRef<HTMLDivElement>(null);
  const vidRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const track = trackRef.current;
    const v = vidRef.current;
    const frameLabel = frameRef.current;
    if (!track || !v || !frameLabel) return;

    // La vidéo ne doit jamais jouer toute seule : scrub uniquement.
    v.pause();
    v.removeAttribute("autoplay");
    v.currentTime = 0;

    let duration = 0;
    // Position et vitesse du ressort, en fraction de la durée (0..1).
    let pos = 0;
    let vel = 0;
    let target = 0;
    let raf = 0;
    let running = false;
    // Seeks sérialisés : un seul currentTime en vol à la fois. Poser
    // currentTime à chaque tick annule le seek précédent — sur du VP9 alpha
    // (seeks coûteux, reconstruction depuis la keyframe), le navigateur
    // n'affichait alors que quelques images et la page paraissait gelée.
    // On attend l'événement « seeked » (frame réellement affichée) pour
    // demander la suivante : la file se vide à la vitesse du décodeur.
    let seekInFlight = false;

    const total = () => Math.max(1, Math.round(duration * SEQ_FPS));

    // Demande de seek quantifié à l'image (ignorée si un autre seek est
    // en vol ou si l'écart est inférieur à une demi-image).
    const requestSeek = () => {
      if (seekInFlight) return;
      const frame = Math.round(pos * total());
      const t = Math.min(frame / SEQ_FPS, Math.max(0, duration - 0.01));
      if (Math.abs(v.currentTime - t) < 0.5 / SEQ_FPS) return;
      seekInFlight = true;
      v.currentTime = t;
    };
    const onSeeked = () => {
      seekInFlight = false;
      // La frame est affichée : enchaîne la suivante si le ressort a bougé.
      requestSeek();
    };

    // Position d'affichage (label) + demande de seek.
    const show = () => {
      const frame = Math.round(pos * total());
      frameLabel.textContent = `image ${String(frame).padStart(3, "0")} / ${total()}`;
      requestSeek();
    };

    // La boucle tourne tant que le ressort n'est pas posé : c'est elle qui
    // fait « rouler un peu plus longtemps » les frames après le scroll.
    const tick = () => {
      vel = vel * FOLLOW_DRAG + (target - pos) * FOLLOW_GAIN;
      pos += vel;
      if (Math.abs(target - pos) < SETTLE_EPSILON && Math.abs(vel) < SETTLE_EPSILON) {
        pos = target;
        vel = 0;
        show();
        running = false;
        return;
      }
      show();
      raf = requestAnimationFrame(tick);
    };
    const wake = () => {
      if (!running) {
        running = true;
        raf = requestAnimationFrame(tick);
      }
    };

    // Cible du ressort : même calcul que l'ancienne version instantanée.
    const aim = () => {
      const travel = track.offsetHeight - window.innerHeight;
      target = travel > 0 ? Math.min(1, Math.max(0, window.scrollY / travel)) : 0;
      wake();
    };

    // Les seeks ne peuvent pas dépasser la durée connue : on attend les
    // métadonnées avant de brancher le scroll.
    const onMeta = () => {
      duration = v.duration || 0;
      aim();
    };
    if (v.readyState >= 1) onMeta();
    else v.addEventListener("loadedmetadata", onMeta, { once: true });
    v.addEventListener("seeked", onSeeked);

    window.addEventListener("scroll", aim, { passive: true });
    window.addEventListener("resize", aim, { passive: true });
    return () => {
      window.removeEventListener("scroll", aim);
      window.removeEventListener("resize", aim);
      v.removeEventListener("seeked", onSeeked);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="eau-track" ref={trackRef}>
      <div className="eau-stage">
        {/* Le titre est SOUS la vidéo : l'alpha du sable le révèle */}
        <div className="eau-title" aria-hidden="true">
          <h1>La mer se retire</h1>
          <p>scrollez — image par image</p>
        </div>
        <video
          className="eau-video"
          ref={vidRef}
          src="/video/eau-leger.webm"
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
        />
        <p className="eau-counter">
          <span ref={frameRef}>image 000 / 000</span>
        </p>
      </div>
    </div>
  );
}
