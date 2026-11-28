import { createFileRoute } from "@tanstack/react-router";
import { meta } from "@/components/portfolio";
import { CacheMaskScene } from "@/components/cache-scene";

export const Route = createFileRoute("/cache-4-new")({
  head: () =>
    meta(
      "Cache 4 bis — Labo",
      "Démo : le cache de /cache-4 avec un masque lissé — flou spatial de l'alpha (frontière géographiquement continue) et moyenne glissante entre frames (continuité temporelle) contre le scintillement.",
    ),
  component: () => (
    <CacheMaskScene
      forwardSrc="/video/VsfYiDfXWKKyIO0_XpqsYg-sharp.mp4"
      reverseSrc="/video/VsfYiDfXWKKyIO0_XpqsYg-sharp-reverse.mp4"
      eyebrow="Labo — démo / Cache vidéo n°4 bis"
      title="Flux"
      lede="Même cache que le n°4, mais la frontière eau/texte est lissée dans l'espace (flou de l'alpha) et dans le temps (moyenne glissante) : plus de scintillement sur les bords."
      maskWidth={256}
      softness={20}
      spatialBlur={2}
      temporalSmooth={0.35}
    />
  ),
});
