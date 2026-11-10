import { useLayoutEffect, useRef, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowDown, ArrowUpRight, X } from 'lucide-react';
import { Footer, meta, projects } from '@/components/portfolio';
import { useHomeScroll } from '@/hooks/use-hero-scroll';
import cyclist from '@/assets/cyclist.jpg';
export const Route = createFileRoute('/')({ head: () => meta('Amaury — Portfolio créatif', 'Un regard libre sur la direction artistique, la photographie et les expériences visuelles.'), component: Index });

const BLOB_SHAPES = 5; // nombres de variantes de patatoïdes répétées pour .project-slide.blob-N

// Un projet en patatoïde : arrive du coin haut droit, se pose au centre droit,
// et peut être agrandi (bouton « Aperçu ») pour révéler ses détails.
function ProjectSlide({ project, index }: { project: (typeof projects)[number]; index: number }) {
  const [expanded, setExpanded] = useState(false);

  const expand = (next: boolean) => {
    setExpanded(next);
    // Figé le scroll pendant la vue agrandie (Lenis quand dispo, sinon overflow natif)
    const lenis = (window as unknown as { __lenis?: { start: () => void; stop: () => void } }).__lenis;
    bodyLock(next);
    if (next) lenis?.stop(); else lenis?.start();
  };

  return (
    <article
      className={`project-slide blob-${index % BLOB_SHAPES}${expanded ? ' is-expanded' : ''}`}
      data-project-id={project.id}
    >
      <div className="project-blob">
        <img src={project.image} alt={project.title} loading="lazy" width={1600} height={1000} />
        {/* Détails du projet — contenus à remplir plus tard */}
        <div className="project-details">
          <p className="project-details-id">{project.id}</p>
          <h2>{project.title}</h2>
          <p className="project-details-meta">{project.category} — {project.year}</p>
          <p className="project-details-body">{project.description || 'Description du projet à venir.'}</p>
        </div>
        <button type="button" className="project-expand" onClick={() => expand(true)} aria-label={`Agrandir ${project.title}`}>
          Aperçu <ArrowUpRight size={15} aria-hidden="true" />
        </button>
        <button type="button" className="project-close" onClick={() => expand(false)} aria-label={`Refermer ${project.title}`}>
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <p className="project-slide-label"><span>{project.title}</span><span>{project.category} — {project.year}</span></p>
    </article>
  );
}

// Verrou natif sur le body — en complément de Lenis (déjà stoppé au besoin)
function bodyLock(locked: boolean | undefined) {
  document.body.style.overflow = locked ? 'hidden' : '';
}

function Index() {
  const contentRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  // Scène d'accueil : hero + patatoïdes projets + footer, pilotés par le scroll (GSAP)
  const stageRef = useHomeScroll();

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

  return (
    <section className="hero-stage" ref={stageRef}>
      <section className="hero">
        <img src={cyclist} width={1920} height={1088} alt="Un cycliste sur une route de campagne, entre mouvement et nature" className="hero-photo" fetchPriority="high" />
        <div className="hero-content" ref={contentRef}>
          <div className="hero-eyebrow"><span>Portfolio indépendant / Édition 2026</span><span>Un regard, des idées.</span></div>
          <h1 className="mega-title" ref={titleRef}><span className="whitespace-nowrap">DEV2SITE__</span></h1>
          <div className="hero-caption"><p>Créer des images. Faire bouger les lignes.<br />Direction artistique & photographie ↗</p><p className="right">Un portfolio par Amaury<br />Sélection 2026</p></div>
          <p className="hero-note">Je pars d’une idée, d’un détail, d’une envie de faire autrement. Entre direction artistique, photographie et explorations visuelles, je construis des univers qui ont quelque chose à raconter. Voici une sélection de ce qui m’anime.</p>
        </div>
        <div className="hero-bottom"><span>01 — LE REGARD</span><Link to="/projets" className="flex items-center gap-3 text-overlay-foreground">Découvrir les projets <span className="round-link"><ArrowUpRight size={20} /></span></Link><ArrowDown size={16} aria-hidden="true" /></div>
      </section>
      <div className="project-rail">
        {projects.map((project, i) => <ProjectSlide key={project.id} project={project} index={i} />)}
      </div>
      <Footer />
    </section>
  );
}
