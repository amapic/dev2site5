import { useEffect } from 'react';
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// Active le smooth scrolling (inertie type Lenis) sur toute la page,
// sauf si l'utilisateur préfère réduire les animations.
// Lenis pilote le scroll natif de la fenêtre : on synchronise ScrollTrigger dessus.
export function useSmoothScroll() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const lenis = new Lenis({ autoRaf: true });
    lenis.on('scroll', ScrollTrigger.update);
    return () => lenis.destroy();
  }, []);
}

// Retourne true si le navigateur n'exécute pas la logique de scroll avancée.
export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
