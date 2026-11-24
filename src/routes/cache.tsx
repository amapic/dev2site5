import { createFileRoute } from "@tanstack/react-router";
import { meta } from "@/components/portfolio";
import { CacheMaskScene } from "@/components/cache-scene";

export const Route = createFileRoute("/cache")({
  head: () =>
    meta(
      "Cache — Labo",
      "Démo : la vidéo de fond de /video derrière un cache eau/sable calculé en direct, en ping-pong ×2, qui révèle ou masque la titraille.",
    ),
  component: () => (
    <CacheMaskScene
      forwardSrc="/video/a.mp4"
      reverseSrc="/video/a-reverse.mp4"
      nightToggle
      eyebrow="Labo — démo / Cache vidéo"
      title="Cache"
      lede="La vidéo de fond joue en ping-pong (×2) et ce texte n'apparaît là où la lame d'eau ne le recouvre pas."
    />
  ),
});
