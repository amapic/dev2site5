import { Link } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { WebGLImage } from '@/components/webgl-image';
import cyclist from '@/assets/cyclist.jpg';
import groupeleonie from '@/assets/groupeleonie.webp';
import uconsulting from '@/assets/uconsulting.webp';
import giulia from '@/assets/giulia.webp';
import stanleygrant from '@/assets/stanleygrant.webp';
import pierrebazin from '@/assets/pierrebazin.jpg';
import mariedurand from '@/assets/mariedurand.jpg';

// Flèche universelle du site : l'image fleche.png (retournée en CSS, le fichier pointe vers le bas)
export function Arrow({ size = 14 }: { size?: number }) {
  return <img src="/fleche.png" alt="" width={40} height={size} className="inline-arrow" />;
}

export const projects = [
  { id: '001', title: 'Groupe Leonie', category: 'Corporate', year: '2025', image: groupeleonie, description: '' },
  { id: '002', title: 'U-Consulting', category: 'Corporate', year: '2026', image: uconsulting, description: '' },
  { id: '003', title: 'Portfolio de designer UX UI', category: 'Portfolio', year: '2025', image: giulia, description: '' },
  { id: '004', title: 'Site Marchand Shopify', category: 'E-commerce', year: '2026', image: stanleygrant, description: '' },
  { id: '005', title: 'Portfolio de photographe', category: 'Portfolio', year: '2024', image: pierrebazin, description: '' },
  { id: '006', title: 'Site professionel', category: 'Corporate', year: '2025', image: mariedurand, description: '' },
];
// Coordonnées du footer : laissez vide tant que l'information n'est pas disponible (affiche « À venir »)
export const siteContact = {
  address: '8 rue Sully, 69006 Lyon',
  hours: 'Lundi – Vendredi : 9h – 18h',
  phone: '',
  email: '',
  website: { label: 'dev2site.net', url: 'https://dev2site.net' },
  socials: [
    { label: 'Instagram', url: '' },
    { label: 'LinkedIn', url: '' },
    { label: 'Behance', url: '' },
  ],
};
export function ProjectGrid({ filter = 'Tous' }: { filter?: string }) {
  const [selected, setSelected] = useState<(typeof projects)[number] | null>(null);
  const [start, setStart] = useState(0);
  const [dir, setDir] = useState(0);
  const [run, setRun] = useState(0);
  const list = projects.filter(p => filter === 'Tous' || p.category === filter);
  const n = list.length;
  const order = list.map((_, i) => list[(i + start) % n] ?? list[0]!);
  useEffect(() => { setStart(0); setDir(0); }, [filter]);
  const step = (d: number) => { setStart(s => (s + d + n) % n); setDir(d); setRun(r => r + 1); };
  // Côté d'où arrive chaque carte (-1 gauche, 1 droite) pour l'animation WebGL
  const slideFrom = (k: number) => (dir === 0 ? 0 : Math.sign((((k + dir) % n) + n) % n - k));
  useEffect(() => {
    if (!selected) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelected(null); };
    window.addEventListener('keydown', close);
    return () => { document.body.style.overflow = old; window.removeEventListener('keydown', close); };
  }, [selected]);
  return <>
    {n > 1 && <div className="project-nav" aria-label="Navigation des projets"><Button variant="ghost" size="icon" aria-label="Projet précédent" onClick={() => step(-1)}><ChevronLeft /></Button><Button variant="ghost" size="icon" aria-label="Projet suivant" onClick={() => step(1)}><ChevronRight /></Button></div>}
    <div className="project-grid">{order.map((project, k) => <article key={project.id}>
      <Button variant="ghost" className="project-visual h-auto w-full rounded-none p-0" onClick={() => setSelected(project)} aria-label={`Voir ${project.title}`}>
        <WebGLImage src={project.image} alt={project.title} from={slideFrom(k)} runKey={run} />
      </Button>
      <div className="project-label"><div><h2>{project.title}</h2><p>{project.category} — {project.year}</p></div><Button variant="ghost" size="icon" aria-label={`Ouvrir ${project.title}`} onClick={() => setSelected(project)}><img src="/fleche.png" alt="" className="project-arrow" /></Button></div>
    </article>)}</div>
    {selected && <div className="project-dialog" role="dialog" aria-modal="true" aria-label={selected.title}>
      <Button autoFocus variant="outline" size="icon" className="dialog-close" aria-label="Fermer le projet" onClick={() => setSelected(null)}><X /></Button>
      <div className="section-top"><span>Projet / {selected.id}</span><span>{selected.category} — {selected.year}</span></div>
      <h2>{selected.title}</h2><img src={selected.image} alt={selected.title} width={1600} height={1088} /><p className="contact-small mt-6">{selected.description}</p>
    </div>}
  </>;
}
export function Header({ onImage }: { onImage: boolean }) {
  return <header className={`site-header ${onImage ? 'on-image' : ''}`}><Link to="/" className="wordmark">amaury<span>©</span></Link><nav className="site-nav" aria-label="Navigation principale"><Link to="/" activeOptions={{ exact: true }}>Accueil<sup>01</sup></Link><Link to="/projets">Projets<sup>02</sup></Link><Link to="/contact">Contact<sup>03</sup></Link></nav></header>;
}
export function Footer() {
  const pending = 'À venir';
  const { address, hours, phone, email, website, socials } = siteContact;
  return <footer className="site-footer">
    <div className="footer-grid">
      <div>
        <span className="footer-label">Contact</span>
        <p>{address || pending}</p>
        {hours && <p>{hours}</p>}
        <p>{phone ? <a href={`tel:${phone.replace(/\s/g, '')}`}>{phone}</a> : pending}</p>
        <p>{email ? <a href={`mailto:${email}`}>{email}</a> : pending}</p>
        <p>{website && <a href={website.url} target="_blank" rel="noreferrer">{website.label} <Arrow /></a>}</p>
      </div>
      <div>
        <span className="footer-label">Réseaux</span>
        <ul>{socials.map(s => <li key={s.label}>{s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.label} <Arrow /></a> : <span>{s.label} — {pending}</span>}</li>)}</ul>
      </div>
      <div>
        <span className="footer-label">Projets</span>
        <p><Link to="/projets">Voir les projets <Arrow /></Link></p>
        <p><Link to="/contact" className="text-foreground">On en parle ? <Arrow /></Link></p>
      </div>
    </div>
    <div className="footer-bottom"><span>© 2026 Amaury — Portfolio créatif</span><span>Direction créative digitale · Sites conçus sur dev2site.net</span></div>
  </footer>;
}
export function meta(title: string, description: string) { return { meta: [{ title }, { name: 'description', content: description }, { property: 'og:title', content: title }, { property: 'og:description', content: description }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] }; }
