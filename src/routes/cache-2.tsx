import { createFileRoute } from "@tanstack/react-router";
import { meta } from "@/components/portfolio";
import { CacheMaskScene } from "@/components/cache-scene";

export const Route = createFileRoute("/cache-2")({
  head: () =>
    meta(
      "Cache 2 — Labo",
      "Démo : tmpls3oj5xg.mp4 en fond, ping-pong ×2, l'eau qui monte est détectée en direct et masque la titraille.",
    ),
  component: () => (
    <CacheMaskScene
      forwardSrc="/video/output.mp4"
      reverseSrc="/video/tmpls3oj5xg-reverse.mp4"
      eyebrow="Labo — démo / Cache vidéo n°2"
      title="Ressac"
      lede="Ici l'eau remonte du haut de l'écran : le texte est mangé puis libéré à chaque aller-retour (×2)."
    />
  ),
});
