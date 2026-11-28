import { createFileRoute } from "@tanstack/react-router";
import { meta } from "@/components/portfolio";
import { CacheMaskScene } from "@/components/cache-scene";

export const Route = createFileRoute("/cache-4")({
  head: () =>
    meta(
      "Cache 4 — Labo",
      "Démo : VsfYiDfXWKKyIO0_XpqsYg (version unsharp, réencodée crf 17) en fond, ping-pong ×2, l'eau qui monte est détectée en direct et masque la titraille.",
    ),
  component: () => (
    <CacheMaskScene
      forwardSrc="/video/VsfYiDfXWKKyIO0_XpqsYg-esrgan.mp4"
      reverseSrc="/video/VsfYiDfXWKKyIO0_XpqsYg-esrgan-reverse.mp4"
      eyebrow="Labo — démo / Cache vidéo n°4"
      title="Flux"
      lede="L'eau monte depuis le haut de l'écran en ×2 : le texte est recouvert par chaque lame puis révélé au reflux."
    />
  ),
});
