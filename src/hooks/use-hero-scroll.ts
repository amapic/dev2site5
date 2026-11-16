import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { prefersReducedMotion } from "@/hooks/use-smooth-scroll";

gsap.registerPlugin(ScrollTrigger);

// Scène d'accueil entièrement pilotée par le scroll (GSAP ScrollTrigger + Lenis) :
// 1. le hero vit puis se range en haut à gauche (comme une carte),
// 2. chaque projet arrive en patatoïde du coin haut droit, se pose au centre droit
//    en morphant de sa forme de début vers sa forme de fin, puis s'envole vers
//    le bas droit en disparaissant — une image à la fois,
// 3. le footer monte du bas pour conclure.
// Pendant son arrêt au centre, un bouton « Aperçu » agrandit le patatoïde
// pour révéler les détails du projet (fermeture par « ✕ » ou Échap).
// Sans animation (prefers-reduced-motion), la scène se lit simplement en colonne (voir styles.css).
export function useHomeScroll() {
  const stageRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    if (prefersReducedMotion()) return;
    const stage = stageRef.current;
    if (!stage) return;

    const slides = gsap.utils.toArray<HTMLElement>(".project-slide", stage);
    const footer = stage.querySelector<HTMLElement>(".site-footer");
    const hero = stage.querySelector<HTMLElement>(".hero");

    // Durées en « unités de pin » (1 unité ≈ 100vh de défilement)
    const projectStep = 1.0; // arrivée (0→0.25) → morphing (0.25→0.75) → envol fondu (0.75→1)
    const footerSpan = 0.7;
    const total = 1 + slides.length * projectStep + footerSpan;

    // Float du hero : activé/désactivé par la progression de la timeline.
    // Jeu d'état idempotent : play() sur un tween déjà en cours est sans effet,
    // pause(0) + reset ramènent le hero en place quand on remonte.
    // Les tweens sont créés DANS le contexte (revert au démontage) mais AVANT
    // la timeline : onUpdate du ScrollTrigger peut tirer dès son refresh
    // initial, avant la fin de la fonction de contexte.
    let floatY: gsap.core.Tween | undefined;
    let floatTilt: gsap.core.Tween | undefined;
    const applyFloat = (on: boolean) => {
      if (!hero) return;
      if (on) {
        hero.classList.add("hero-bubble");
        if (floatY && floatTilt) {
          floatY.play();
          floatTilt.play();
        }
      } else {
        hero.classList.remove("hero-bubble");
        if (floatY && floatTilt) {
          floatY.pause(0);
          floatTilt.pause(0);
        }
        gsap.set(hero, { y: 0, rotation: 0 });
      }
    };

    const ctx = gsap.context(() => {
      if (hero) {
        floatY = gsap.to(hero, {
          y: -14,
          duration: 2.4,
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
          paused: true,
        });
        floatTilt = gsap.fromTo(
          hero,
          { rotation: -0.8 },
          {
            rotation: 0.8,
            duration: 3.8,
            ease: "sine.inOut",
            repeat: -1,
            yoyo: true,
            paused: true,
            immediateRender: false,
          },
        );
      }
      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: stage,
          start: "top top",
          end: `+=${Math.round(total * 100)}%`,
          pin: true,
          pinSpacing: true,
          scrub: true,
          anticipatePin: 1,
          // Float du hero couplé à la progression : il ne tourne que quand
          // le rangement en médaillon est achevé (1re unité sur total).
          onUpdate: (self) => applyFloat(self.progress >= 1 / total),
        },
      });

      // 1 · Le hero vit (0 → 0.5) puis se range en haut à gauche (0.5 → 1).
      // Le titre se recale automatiquement sur la carte grâce au ResizeObserver.
      tl.fromTo(".hero-photo", { scale: 1 }, { scale: 1.12, duration: 0.5 }, 0)
        .fromTo(".mega-title", { yPercent: 0 }, { yPercent: -12, duration: 0.4 }, 0)
        .fromTo(
          ".hero-eyebrow span",
          { y: 0, opacity: 1 },
          { y: -14, opacity: 0, duration: 0.2, stagger: 0.05 },
          0.15,
        )
        .fromTo(
          ".hero-caption, .hero-note",
          { opacity: 1, y: 0 },
          { opacity: 0, y: -24, duration: 0.25 },
          0.2,
        )
        .fromTo(
          hero,
          // Rayons elliptiques par coin (horizontal / vertical) : la carte finit en forme de patate
          {
            left: "0%",
            top: "0%",
            width: "100%",
            height: "100%",
            scale: 1,
            transformOrigin: "0% 0%",
            borderRadius: "0% 0% 0% 0% / 0% 0% 0% 0%",
          },
          {
            left: "4%",
            top: "6%",
            // Mise à l'échelle uniforme : le hero garde ses proportions d'origine, en plus petit
            scale: 0.3,
            transformOrigin: "0% 0%",
            borderRadius: "58% 42% 63% 37% / 46% 61% 39% 54%",
            duration: 0.5,
          },
          0.5,
        );

      // 2 · Les projets défilent un à un : du coin haut droit (arrivée),
      // pose au centre droit (« Aperçu » dispo pendant l'arrêt),
      // puis envol vers le bas droit — jamais deux images à l'écran.
      slides.forEach((slide, i) => {
        const t = 1 + i * projectStep;
        tl.fromTo(
          slide,
          { xPercent: 120, yPercent: -160, autoAlpha: 0, rotate: 8 },
          { xPercent: 0, yPercent: 0, autoAlpha: 1, rotate: 0, duration: 0.25 },
          t,
        );
        // Morphing du patatoïde pendant la pose : l'attribut data-ink-morph
        // (0 → 1) est relu par InkBlobImage à chaque frame — le shader mixe
        // alors ses deux SDF recuites, forme de début → forme de fin.
        tl.set(slide, { attr: { "data-ink-morph": 0 } }, t).to(
          slide,
          { attr: { "data-ink-morph": 1 }, duration: 0.5 },
          t + 0.25,
        );
        // Le bouton « Aperçu » n'est actif que pendant l'arrêt au centre droit
        const expandBtn = slide.querySelector<HTMLElement>(".project-expand");
        if (expandBtn) {
          tl.fromTo(
            expandBtn,
            { autoAlpha: 0, scale: 0.85 },
            { autoAlpha: 1, scale: 1, duration: 0.12 },
            t + 0.3,
          ).to(expandBtn, { autoAlpha: 0, scale: 0.85, duration: 0.12 }, t + 0.55);
        }
        // Sortie : une fois le morphing achevé, le patatoïde s'échappe en bas
        // droit et disparaît (autoAlpha → 0 et visibility:hidden).
        tl.to(
          slide,
          { xPercent: 40, yPercent: 120, autoAlpha: 0, rotate: -6, duration: 0.25 },
          t + 0.75,
        );
      });

      // 4 · Effet « bulle » : quand le patatoïde du hero est posé en médaillon
      // (fin de la 1re unité de pin), il flotte et ondule comme du liquide.
      // Deux tweens yoyo indépendants sur y/rotation (jamais écrits par la
      // timeline scrubée, voir applyFloat plus haut) ; l'ondulation du bord
      // est une animation CSS (.hero-bubble, voir styles.css) qui gagne sur
      // les styles inline du scrub, donc aucun conflit pendant le défilement.
      // L'activation/désactivation est pilotée par onUpdate du ScrollTrigger
      // principal — un ScrollTrigger dédié se déclencherait à tort : l'élément
      // est épinglé (position fixe) par la timeline, sa mesure de bounds n'est
      // plus fiable pour un second trigger.
      applyFloat(false);

      // 3 · Le footer monte du bas pour conclure la séquence.
      if (footer) {
        tl.fromTo(
          footer,
          { yPercent: 105 },
          { yPercent: 0, duration: footerSpan },
          1 + slides.length * projectStep,
        );
      }
    }, stage);

    return () => ctx.revert();
  }, []);

  // Positions exactes une fois les polices chargées
  useLayoutEffect(() => {
    document.fonts?.ready.then(() => ScrollTrigger.refresh());
  }, []);

  return stageRef;
}
