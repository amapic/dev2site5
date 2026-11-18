import { useEffect, useState } from "react";
import { prefersReducedMotion } from "@/hooks/use-smooth-scroll";

// Polices manuscrites (Google Fonts) — href à charger dans le head <links>
// de chaque route qui affiche la scène.
export const HANDWRITING_FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Caveat:wght@400..700&family=Shadows+Into+Light&family=Nanum+Pen+Script&display=swap";

// Polices manuscrites chargées via HANDWRITING_FONT_HREF et cyclées toutes les 500 ms.
const HAND_FONTS = ["font-hand-caveat", "font-hand-shadowlight", "font-hand-nanum"] as const;

// Grande image derrière le texte : captures alternées, dans la même
// alternance que les polices (l'index des polices est tourné modulo leur nombre).
const ARROWS = ["/Capture.PNG", "/Capture2.PNG", "/Capture3.PNG"] as const;

// Scène manuscrite : page blanche, texte centré à l'écriture cyclée,
// grande image derrière le texte. Réutilisée seule (route /manuscrit,
// via .manuscrit-page) et en fond de la scène d'accueil (via .hero-manuscrit).
export function ManuscritUnderlay({ className = "" }: { className?: string }) {
  const [fontIndex, setFontIndex] = useState(0);

  useEffect(() => {
    // Si l'utilisateur préfère réduire les animations : fixé sur la première police.
    if (prefersReducedMotion()) return;
    const timer = window.setInterval(() => {
      setFontIndex((i) => (i + 1) % HAND_FONTS.length);
    }, 500);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className={`manuscrit-scene ${className}`}>
      <p className={`manuscrit-text ${HAND_FONTS[fontIndex]}`}>
        Je pars d’une idée, d’un détail, d’une envie de faire autrement.
      </p>
      <div className="manuscrit-arrow" aria-hidden="true">
        {/* Deux captures alternées, synchronisées avec le cycle des polices */}
        <img src={ARROWS[fontIndex % ARROWS.length]} alt="" draggable={false} />
      </div>
    </div>
  );
}
