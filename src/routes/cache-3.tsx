import { createFileRoute } from "@tanstack/react-router";
import { meta } from "@/components/portfolio";
import { CacheMaskScene } from "@/components/cache-scene";

export const Route = createFileRoute("/cache-3")({
  head: () =>
    meta(
      "Cache 3 — Labo",
      "Démo : a_tester.mp4 en fond, ping-pong ×2, les vagues successives sont détectées en direct et masquent la titraille.",
    ),
  component: () => (
    <CacheMaskScene
      forwardSrc="/video/a_tester.mp4"
      reverseSrc="/video/a_tester-reverse.mp4"
      eyebrow="Labo — démo / Cache vidéo n°3"
      title="Marées"
      lede="Trois allez-retours de vagues en ×2 : le texte disparaît sous chaque lame d'eau et resurgit sur le sable."
    />
  ),
});
