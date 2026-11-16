import { createFileRoute } from "@tanstack/react-router";
import { meta } from "@/components/portfolio";
import { prefersReducedMotion } from "@/hooks/use-smooth-scroll";

export const Route = createFileRoute("/video")({
  head: () =>
    meta(
      "Vidéo — Labo",
      "Démo : une vidéo en fond de page tout entière, recadrée plein cadre (object-fit cover), avec titraille par-dessus.",
    ),
  component: VideoBackgroundPage,
});

/* ------------------------------------------------------------------ */
/* DEMO « VIDÉO » : un mp4 de public/ étiré en fond sur toute la page. */
/* Lecture automatique en boucle, son coupé (condition requise par les */
/* navigateurs pour autoriser l'autoplay). Sans animation, l'autoplay  */
/* est désactivé et une affiche figée reste posée.                     */
/* ------------------------------------------------------------------ */

function VideoBackgroundPage() {
  return (
    <div className="video-stage">
      <video
        className="video-bg"
        src="/0001_1_a-high-resolution-photograph-of-a-pristi_QgGbEz7TXAmmWEA5WLY89g_HYTvJz6qTseF5zh7elJNQw_cover.mp4"
        autoPlay={!prefersReducedMotion()}
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden="true"
      />
      <div className="video-shade" aria-hidden="true" />
      <div className="video-titling">
        <p className="video-eyebrow">Labo — démo n°3 / Fond vidéo</p>
        <h1 className="video-title">Vidéo</h1>
        <p className="video-lede">
          Le film tourne en boucle sous la page, recadré pour occuper tout l'écran.
        </p>
      </div>
    </div>
  );
}
