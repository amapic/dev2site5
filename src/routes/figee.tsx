import { useEffect, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { meta } from "@/components/portfolio";
import { prefersReducedMotion } from "@/hooks/use-smooth-scroll";

export const Route = createFileRoute("/figee")({
  head: () =>
    meta(
      "Figée — Labo",
      "Démo : une image fixe du sable (la dernière frame de la vidéo) et, par-dessus, le film de l'eau seule en ping-pong — seule l'eau vit, la plage reste une photographie.",
    ),
  component: FrozenFramePage,
});

/* ------------------------------------------------------------------ */
/* DEMO « IMAGE FIGÉE » (/figee) — option 1 du triple calque :         */
/*   1. <img> sable.webp : la DERNIÈRE frame de a.mp4, extraite par    */
/*      ffmpeg (-sseof) — tout sable, aucune eau cuite dans l'image    */
/*      (une eau figée transparaîtrait sous l'alpha quand le film      */
/*      recule : c'est le piège de ce montage).                        */
/*   2. <video> eau.webm + eau-reverse.webm : le film eau-seule        */
/*      (water_only.py : eau visible, sable alpha 0) empilé en         */
/*      ping-pong — au « ended » de l'un, on échange les opacités et   */
/*      l'autre repart de 0 (la 1re frame de la copie inversée = la    */
/*      dernière de l'aller, donc la bascule est invisible).           */
/* La photographie ne bouge jamais : seule l'eau, qui n'existe qu'en   */
/* vidéo, coule et reflue dessus.                                      */
/* ------------------------------------------------------------------ */

function FrozenFramePage() {
  const fwdRef = useRef<HTMLVideoElement>(null);
  const revRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const fwd = fwdRef.current;
    const rev = revRef.current;
    if (!fwd || !rev) return;

    // Bascule aller -> retour : la copie inversée repart de 0 (= dernière
    // frame de l'aller), on échange simplement les opacités.
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
    <div className="figee-stage">
      {/* 1 · La photographie : dernière frame de a.mp4, tout sable */}
      <img className="figee-photo" src="/video/sable.webp" alt="" aria-hidden="true" />
      {/* 2 · L'eau vivante, en ping-pong par-dessus la photo */}
      <video
        className="figee-water"
        ref={fwdRef}
        src="/video/eau.webm"
        autoPlay
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
      />
      <video
        className="figee-water"
        ref={revRef}
        src="/video/eau-reverse.webm"
        muted
        playsInline
        preload="auto"
        style={{ opacity: 0 }}
        aria-hidden="true"
      />
      <div className="figee-titling">
        <p className="figee-eyebrow">Labo — démo / Image figée</p>
        <h1 className="figee-title">Figée</h1>
        <p className="figee-lede">
          La plage est une photographie. L'eau, elle, n'a jamais été figée.
        </p>
      </div>
    </div>
  );
}
