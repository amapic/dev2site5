import { createFileRoute } from "@tanstack/react-router";
import { meta } from "@/components/portfolio";
import { HANDWRITING_FONT_HREF, ManuscritUnderlay } from "@/components/manuscrit-underlay";

export const Route = createFileRoute("/manuscrit")({
  head: () => ({
    ...meta(
      "Manuscrit — Notes",
      "Une page blanche, un texte qui change d’écriture manuscrite toutes les demi-secondes.",
    ),
    links: [{ rel: "stylesheet", href: HANDWRITING_FONT_HREF }],
  }),
  component: () => (
    <section className="manuscrit-page">
      <ManuscritUnderlay />
    </section>
  ),
});
