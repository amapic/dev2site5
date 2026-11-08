import { createFileRoute } from '@tanstack/react-router';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { meta } from '@/components/portfolio';
export const Route = createFileRoute('/contact')({ head: () => meta('Contact — Amaury', 'Un projet, une idée ou une collaboration ? Préparez votre message pour Amaury.'), component: Contact });
function Contact() {
  const [brief, setBrief] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  async function copy() { try { await navigator.clipboard.writeText(brief); setCopied(true); setError(false); } catch { setError(true); } }
  return <main className="page-content"><div className="section-top"><span>03 — LA SUITE</span><span>Une idée commence par un échange.</span></div><h1 className="page-title">BONJOUR_003</h1><div className="contact-grid"><div><p className="contact-intro">Un projet en tête ?<br />Faisons-en quelque chose<br />qui ne ressemble qu’à vous.</p><p className="contact-small">Identité, direction artistique, photographie ou simplement une idée à explorer. Les belles histoires commencent souvent par quelques mots.</p><p className="contact-small mt-8">Coordonnées de contact à venir.</p></div><div><label htmlFor="brief" className="brief-label">Votre idée, en quelques mots</label><textarea id="brief" className="brief-input" placeholder="Le projet, vos envies, votre calendrier…" value={brief} onChange={e => { setBrief(e.target.value); setCopied(false); }} /><Button className="mt-4" disabled={!brief.trim()} onClick={copy}>{copied ? <Check /> : <Copy />}{copied ? 'Message copié' : 'Copier mon message'}</Button><p className="contact-small mt-3" role="status">{error ? 'La copie est indisponible. Vous pouvez sélectionner votre texte pour le copier.' : copied ? 'Votre message est prêt à être partagé.' : ''}</p></div></div></main>;
}
