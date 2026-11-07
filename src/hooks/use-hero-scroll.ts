import { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { prefersReducedMotion } from '@/hooks/use-smooth-scroll';

gsap.registerPlugin(ScrollTrigger);

// Base GSAP ScrollTrigger : épingle la section hero pendant 120vh de défilement.
// timeline scrubée = la progression du pin (0 → 1) pilote les animations.
// Ajoute d'autres tl.to() / tl.fromTo() pour enrichir la séquence.
export function useHeroScroll() {
  const triggerRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    if (prefersReducedMotion()) return;
    const root = triggerRef.current;
    if (!root) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: root,
          start: 'top top',
          // Pin maintenu pendant 120vh de défilement, puis la suite reprend son cours
          end: '+=120%',
          pin: true,
          pinSpacing: true,
          scrub: true,
          anticipatePin: 1,
        },
      });

      // Séquence scrubée sur la durée du pin (0 → 1 = 120vh de scroll).
      // Chaque tween : (position de départ, durée) sont des fractions du pin.
      tl
        // 0 → 0.5 : zoom lent de la photo + assombrissement progressif
        .fromTo('.hero-photo', { scale: 1, filter: 'brightness(1)' }, { scale: 1.12, filter: 'brightness(0.82)', ease: 'none', duration: 0.5 }, 0)
        // 0 → 0.35 : le titre dérive vers le haut pendant le zoom
        .fromTo('.mega-title', { yPercent: 0 }, { yPercent: -18, ease: 'none', duration: 0.35 }, 0)
        // 0.05 → 0.3 : l'eyebrow se disperse vers le haut, ligne après ligne
        .fromTo('.hero-eyebrow span', { y: 0, opacity: 1 }, { y: -14, opacity: 0, ease: 'none', duration: 0.2, stagger: 0.05 }, 0.05)
        // 0.25 → 0.55 : captions et note s'effacent en glissant
        .fromTo('.hero-caption, .hero-note', { opacity: 1, y: 0 }, { opacity: 0, y: -24, ease: 'none', duration: 0.3 }, 0.25)
        // 0.45 → 0.7 : la barre du bas s'efface à son tour
        .fromTo('.hero-bottom', { opacity: 1, y: 0 }, { opacity: 0, y: 10, ease: 'none', duration: 0.25 }, 0.45)
        // 0.6 → 1 : le titre descend et sort par le bas du cadre
        .fromTo('.mega-title', { yPercent: -18 }, { yPercent: 24, ease: 'none', duration: 0.4 }, 0.6)
        // La racine (.hero) elle-même n'est pas touchée par les sélecteurs scopés :
        // on passe l'élément directement plutôt que le sélecteur '.hero'
        .fromTo(root, { opacity: 1 }, { border: '10px solid white', width: '50%',left: '10%', height: '50%', borderRadius: '50px', ease: 'none', duration: 0.4 }, 0.0);
    }, root);

    return () => ctx.revert();
    // ScrollTrigger.refresh() une fois les polices chargées pour des positions exactes
  }, []);

  useLayoutEffect(() => {
    document.fonts?.ready.then(() => ScrollTrigger.refresh());
  }, []);

  return triggerRef;
}
