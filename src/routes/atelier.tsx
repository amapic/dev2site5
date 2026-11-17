import { createFileRoute } from "@tanstack/react-router";
import { InkBlobImage } from "@/components/ink-blob-image";
import { meta } from "@/components/portfolio";
import groupeleonie from "@/assets/groupeleonie.webp";

export const Route = createFileRoute("/atelier")({
  head: () =>
    meta(
      "Atelier — Patatoïde",
      "Banc d'essai : un patatoïde unique avec le HUD de réglage ouvert, pour choisir ses paramètres définitifs.",
    ),
  component: AtelierPage,
});

/* ------------------------------------------------------------------ */
/* ATELIER : un seul patatoïde (variante 0 = les SVG sculptés), posé   */
/* au centre, piloté par le HUD de réglage ouvert automatiquement.     */
/* Pas de chorégraphie de scroll ici : aucun attribut data-ink-morph   */
/* quand on joue du curseur « Morphing début→fin », on voit passer     */
/* directement de la forme de départ (SVG 1) à celle d'arrivée (SVG 2).*/
/* ------------------------------------------------------------------ */

function AtelierPage() {
  return (
    <div className="atelier-stage">
      <div className="atelier-patatoide">
        <InkBlobImage src={groupeleonie} alt="Photo de démonstration du patatoïde" variant={0} />
      </div>
      <p className="atelier-caption">
        Ajustez les réglages dans le HUD en bas à droite — chaque curseur agit en direct.
      </p>
    </div>
  );
}
