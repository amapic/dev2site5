import { useLayoutEffect, useRef } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowDown, ArrowUpRight } from 'lucide-react';
import { ProjectGrid, meta } from '@/components/portfolio';
import { useHeroScroll } from '@/hooks/use-hero-scroll';
import cyclist from '@/assets/cyclist.jpg';
export const Route = createFileRoute('/')({ head: () => meta('Amaury — Portfolio créatif', 'Un regard libre sur la direction artistique, la photographie et les expériences visuelles.'), component: Index });
function Index() {
  const contentRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  // Section hero épinglée pendant 120vh de scroll (GSAP ScrollTrigger)
  const heroRef = useHeroScroll();

  // Ajuste la taille du titre pour que ses lettres touchent exactement les bords de .hero-content
  useLayoutEffect(() => {
    const content = contentRef.current;
    const title = titleRef.current;
    const text = title?.firstElementChild as HTMLElement | null;
    if (!content || !title || !text) return;

    const fit = () => {
      title.style.fontSize = '100px';
      const natural = text.getBoundingClientRect().width;
      const target = content.clientWidth;
      if (natural > 0 && target > 0) title.style.fontSize = `${(100 * target) / natural}px`;
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(content);
    document.fonts?.ready.then(fit);
    return () => observer.disconnect();
  }, []);

  return <>
  <section className="hero" ref={heroRef}>
    <img src={cyclist} width={1920} height={1088} alt="Un cycliste sur une route de campagne, entre mouvement et nature" className="hero-photo" fetchPriority="high" />
    <div className="hero-content" ref={contentRef}>
      <div className="hero-eyebrow"><span>Portfolio indépendant / Édition 2026</span><span>Un regard, des idées.</span></div>
      <h1 className="mega-title" ref={titleRef}><span className="whitespace-nowrap">DEV2SITE__</span></h1>
      <div className="hero-caption"><p>Créer des images. Faire bouger les lignes.<br />Direction artistique & photographie ↗</p><p className="right">Un portfolio par Amaury<br />Sélection 2026</p></div>
      <p className="hero-note">Je pars d’une idée, d’un détail, d’une envie de faire autrement. Entre direction artistique, photographie et explorations visuelles, je construis des univers qui ont quelque chose à raconter. Voici une sélection de ce qui m’anime.</p>
    </div>
    <div className="hero-bottom"><span>01 — LE REGARD</span><Link to="/projets" className="flex items-center gap-3 text-overlay-foreground">Découvrir les projets <span className="round-link"><ArrowUpRight size={20} /></span></Link><ArrowDown size={16} aria-hidden="true" /></div>
  </section>
  <section className="home-teaser"><div className="section-top"><span>Quelques explorations récentes</span><Link to="/projets" className="text-foreground">Tous les projets ↗</Link></div><h2 className="teaser-title">L’idée devient image.</h2><ProjectGrid /></section>
</>;
}
