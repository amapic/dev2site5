import { useEffect, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { meta } from "@/components/portfolio";
import { prefersReducedMotion } from "@/hooks/use-smooth-scroll";

const PLAYBACK_RATE = 2; // lecture accélérée ×2

export const Route = createFileRoute("/video")({
  head: () =>
    meta(
      "Vidéo — Labo",
      "Démo : une vidéo en fond de page tout entière, recadrée plein cadre (object-fit cover), avec titraille par-dessus.",
    ),
  component: VideoBackgroundPage,
});

/* ------------------------------------------------------------------ */
/* DEMO « VIDÉO » : un mp4 de public/ étiré en fond sur toute la page, */
/* en PING-PONG ×2 : une fois au bout, la vidéo repart en arrière —    */
/* le HTML ne sait pas jouer en arrière, donc une copie inversée       */
/* (a-reverse.mp4, générée avec ffmpeg -vf reverse) est empilée sous    */
/* la normale et on alterne : au « ended » de l'une, on bascule         */
/* l'opacité et on joue l'autre depuis 0. La première frame de la       */
/* copie inversée étant la dernière de l'originale, la bascule est      */
/* invisible. Lecture automatique, son coupé (mute = autoplay autorisé).*/
/* Sans animation (prefers-reduced-motion), l'autoplay est désactivé.   */
/* ------------------------------------------------------------------ */

function VideoBackgroundPage() {
  const fwdRef = useRef<HTMLVideoElement>(null); // a.mp4 (aller)
  const revRef = useRef<HTMLVideoElement>(null); // a-reverse.mp4 (retour)

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const fwd = fwdRef.current;
    const rev = revRef.current;
    if (!fwd || !rev) return;
    fwd.playbackRate = PLAYBACK_RATE;
    rev.playbackRate = PLAYBACK_RATE;

    // Bascule aller -> retour : la copie inversée part de 0 (= dernière frame
    // de l'aller, donc continuité parfaite), on swap simplement l'opacité.
    const toReverse = () => {
      fwd.pause();
      rev.currentTime = 0;
      rev.style.opacity = "1";
      fwd.style.opacity = "0";
      void rev.play();
    };
    const toForward = () => {
      rev.pause();
      fwd.currentTime = 0;
      fwd.style.opacity = "1";
      rev.style.opacity = "0";
      void fwd.play();
    };
    fwd.addEventListener("ended", toReverse);
    rev.addEventListener("ended", toForward);
    void fwd.play();
    return () => {
      fwd.removeEventListener("ended", toReverse);
      rev.removeEventListener("ended", toForward);
    };
  }, []);

  return (
    <div className="video-stage bg-white">
      <video
        className="video-bg"
        src="/video/a.mp4"
        ref={fwdRef}
        autoPlay
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
      />
      <video
        className="video-bg"
        src="/video/a-reverse.mp4"
        ref={revRef}
        muted
        playsInline
        preload="auto"
        style={{ opacity: 0 }}
        aria-hidden="true"
      />
      <div className="video-shade" aria-hidden="true" />
      <div className="video-titling">
        <p className="video-eyebrow">Labo — démo n°3 / Fond vidéo</p>
        <h1 className="video-title">Vidéo</h1>
        <p className="video-lede">
          Le film tourne en ping-pong sous la page (aller-retour ×2), recadré pour occuper tout
          l'écran.
        </p>
      </div>
    </div>
  );
}
