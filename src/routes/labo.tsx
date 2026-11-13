import { useEffect, useRef } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { meta } from '@/components/portfolio';
import { prefersReducedMotion } from '@/hooks/use-smooth-scroll';
import cyclist from '@/assets/cyclist.jpg';

export const Route = createFileRoute('/labo')({
  head: () => meta('Labo — Mise au point', 'Démo : un rack focus sur la page tout entière — le flou se dissout à mesure qu\'on défile.'),
  component: LabPage,
});

/* ------------------------------------------------------------------ */
/* DEMO « MISE AU POINT » : le flou de la page tout entière.           */
/* La page arrive complètement floutée (comme une image hors focus) et */
/* fait la mise au point au fur et à mesure du défilement : blur,      */
/* légère sur-luminosité et désaturation décroissent ensemble, avec un */
/* tout petit dézoom de compensation, exactement comme un rack focus   */
/* de caméra. Les journaux : compteur de netteté + barre de focus.     */
/* ------------------------------------------------------------------ */
const LAB_SCENE = {
  maxBlur: 18, // flou de départ, en px
  maxBrightness: 1.14, // sur-luminosité au cœur du flou (halo de lumière hors focus)
  minSaturate: 0.55, // désaturation au cœur du flou (l'œil perd la couleur avant les formes)
  maxScale: 1.045, // très léger zoom de compensation, en sens inverse du focus
  scrollSpan: 2.2, // durée de la mise au point, en « écrans » de défilement
};

function LabPage() {
  const stageRef = useRef<HTMLDivElement>(null);
  const lensRef = useRef<HTMLDivElement>(null);
  const percentRef = useRef<HTMLOutputElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const hintRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!stageRef.current || prefersReducedMotion()) return;
    const lens = lensRef.current;
    const percent = percentRef.current;
    const bar = barRef.current;
    const hint = hintRef.current;
    if (!lens || !percent || !bar) return;

    gsap.registerPlugin(ScrollTrigger);
    const cubicEase = (t: number) => 1 - Math.pow(1 - t, 3);

    // Remet la page en focus net quand on repasse dessous (retour en haut de page,
    // navigation directe vers un ancre) : progress recalculé par ScrollTrigger.
    const applyFocus = (raw: number) => {
      // La mise au point se joue surtout dans le premier tiers : ease-out.
      const focus = cubicEase(Math.min(1, raw));
      const blur = LAB_SCENE.maxBlur * (1 - focus);
      const brightness = 1 + (LAB_SCENE.maxBrightness - 1) * (1 - focus);
      const saturate = 1 - (1 - LAB_SCENE.minSaturate) * (1 - focus);
      const scale = 1 + (LAB_SCENE.maxScale - 1) * (1 - focus);
      lens.style.filter = blur > 0.08 ? `blur(${blur.toFixed(2)}px) brightness(${brightness.toFixed(3)}) saturate(${saturate.toFixed(3)})` : 'none';
      lens.style.transform = scale > 1.0005 ? `scale(${scale.toFixed(4)})` : 'none';
      percent.textContent = `${Math.round(focus * 100)} %`;
      bar.style.transform = `scaleX(${focus.toFixed(3)})`;
      // L'indice de défilement s'efface dès que la mise au point est engagée.
      if (hint) hint.style.opacity = focus > 0.25 ? '0' : '1';
    };

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: stageRef.current,
        start: 'top top',
        end: `+=${Math.round(LAB_SCENE.scrollSpan * 100)}%`,
        onUpdate: (self) => applyFocus(self.progress),
      });
      applyFocus(0);
    }, stageRef);

    return () => ctx.revert();
  }, []);

  return (
    <div className="focus-stage" ref={stageRef}>
      {/* Tout le contenu passe dans la « lentille » : c'est ce wrapper qui se floute */}
      <div className="focus-lens" ref={lensRef}>
        <article className="focus-article">
          <header className="focus-head">
            <p className="focus-eyebrow">Labo — démo n°1 / Effet plein écran</p>
            <h1 className="page-title focus-title">Mise au point</h1>
            <p className="focus-lede">
              Cette page entière est passée dans un moteur de flou. Elle arrive hors focus, laiteuse, presque
              insaisissable — puis, écran après écran, elle fait ce que fait un tourelle de cinema : elle
              cherche, elle hésite, et finit par trouver. Le défilement est la bague de mise au point.
            </p>
          </header>

          <figure className="focus-figure">
            <img src={cyclist} width={1920} height={1088} alt="Un cycliste sur une route de campagne" loading="lazy" />
            <figcaption>Fig. 01 — Le flou n'est pas l'absence d'image : c'est une image en attente.</figcaption>
          </figure>

          <section className="focus-section">
            <h2><span>01</span> Le flou comme matière</h2>
            <p>
              Un flou bien réglé ne gomme pas l'écran, il le met en attente. En attente d'un regard, d'un geste,
              d'une intention. C'est pourquoi les interfaces les plus nerveuses le réservent à leurs transitions :
              le monde se dissout un instant, puis revient — plus net, plus sûr de lui.
            </p>
            <p>
              Ici, trois valeurs travaillent ensemble : le <em>rayon de blur</em> qui adoucit les formes, la
              <em> sur-luminosité</em> qui lave le contraste, la <em>désaturation</em> qui retire la couleur à la
              périphérie de la perception. Ajouté à cela un infime dé-zoom, et c'est toute la page qui semble
              prise du fond du plateau. Un seul filtre, piloté par une seule valeur : la netteté.
            </p>
          </section>

          <section className="focus-section">
            <h2><span>02</span> Ce que le net veut dire</h2>
            <p>
              La netteté n'est pas la vérité d'une image, c'est une promesse : celle que l'on va pouvoir lire,
              toucher, décider. Le moment où la page fait le point est donc un moment rhétorique. Retenez-le
              pour l'endroit où vous voudrez que le visiteur <em>commence</em> : le net est un aimant, le flou
              une respiration.
            </p>
            <blockquote>
              « On ne montre pas en révélant tout d'un coup. On montre en arrangeant la disparition. »
            </blockquote>
          </section>

          <section className="focus-section focus-section-last">
            <h2><span>03</span> Pour finir, une typographie</h2>
            <p className="focus-fineprint">
              Démo technique — GSAP ScrollTrigger pilote un filtre CSS appliqué au conteneur de la totalité du
              contenu, avec un easing cubique pour que la mise au point se joue dans le premier tiers du
              défilement. Sans mouvement (prefers-reduced-motion), la page s'affiche nette d'entrée.
              Remontez en haut pour la voir redevenir laiteuse, puis redescendez pour la re-focaliser.
            </p>
          </section>
        </article>
      </div>

      {/* Instrument de bord : compteur de netteté + barre de focus (hors zone floutée) */}
      <div className="focus-meter" aria-hidden="true">
        <span className="focus-meter-label">Netteté</span>
        <span className="focus-meter-bar"><span className="focus-meter-fill" ref={barRef} /></span>
        <output className="focus-meter-value" ref={percentRef}>0 %</output>
      </div>
      <p className="focus-hint" ref={hintRef}>Défilez — la bague de mise au point, c'est votre molette</p>
    </div>
  );
}
