import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { HeartPulse, Hourglass, Umbrella, Vault } from "lucide-react";
import { meta } from "@/components/portfolio";
import { HANDWRITING_FONT_HREF } from "@/components/manuscrit-underlay";
import { CacheMaskScene } from "@/components/cache-scene";

export const Route = createFileRoute("/cache")({
  head: () => ({
    ...meta(
      "La Digue — Maison de confiance",
      "Une petite maison de confiance, discrète depuis 1987 : patrimoine, santé privée, crédit sur gage, transmission. La marée est constante ; nos engagements aussi.",
    ),
    links: [{ rel: "stylesheet", href: HANDWRITING_FONT_HREF }],
  }),
  component: BoutiquePage,
});

/* ------------------------------------------------------------------ */
/* SITE « LA DIGUE » — une page unique construite SUR la démo /cache.  */
/* Les 100 premiers vh sont la scène existante (CacheMaskScene,        */
/* intouchée) : le masque eau/sable sert d'ouverture de marque — la    */
/* montée des eaux recouvre puis révèle la promesse de la maison.      */
/* En dessous, les sections d'une petite maison de confiance :         */
/* la maison, les protections, la méthode, la discrétion, les paroles, */
/* le premier contact.                                                 */
/* Deux liens avec la scène :                                          */
/*   - la section « discrétion » pilote le mode nuit de la scène       */
/*     (le prop `night` remonte au canvas : le film glisse vers la     */
/*     nuit quand cette section entre à l'écran, en repart quand elle  */
/*     sort) — la promesse "vos dossiers dormant ici" se voit ;        */
/*   - chaque section s'ouvre à l'apparition (IntersectionObserver).   */
/* Navigation fixe posée après le hero, ancres douces en JS            */
/* (scrollIntoView — pas de scroll-behavior global : Lenis sur /).     */
/* ------------------------------------------------------------------ */

const NAV_LINKS = [
  { href: "#maison", label: "La maison" },
  { href: "#protections", label: "Protections" },
  { href: "#methode", label: "La méthode" },
  { href: "#discretion", label: "Discrétion" },
  { href: "#rendez-vous", label: "Rendez-vous" },
] as const;

const PROTECTIONS = [
  {
    icon: Umbrella,
    name: "Patrimoine",
    line: "Protéger ce qui est bâti, sans bruit.",
    more: "Assurance de biens et de responsabilité pour les maisons de famille, les collections et la vie courante — réglée en jours, pas en trimestres.",
  },
  {
    icon: HeartPulse,
    name: "Santé privée",
    line: "Le meilleur soin sans délai, partout où vous êtes.",
    more: "Accès direct aux meilleurs spécialistes, seconde opinion sous 72 heures, évacuation sanitaire organisée par nous.",
  },
  {
    icon: Vault,
    name: "Crédit sur gage",
    line: "Des liquidités sans vendre votre patrimoine.",
    more: "Fonds disponibles sous 48 h, vos titres et œuvres restent chez vous. Un seul taux, connu d'avance, aucune surprise.",
  },
  {
    icon: Hourglass,
    name: "Transmission",
    line: "Passer le relais sans heurt.",
    more: "Succession préparée à froid, années à l'avance : vos proches signent, ils ne débrouillent rien.",
  },
] as const;

const STEPS = [
  {
    step: "01",
    name: "Écoute",
    line: "Une conversation, pas un formulaire.",
  },
  {
    step: "02",
    name: "Proposition",
    line: "Une page de papier. Les garanties claires, les exclusions aussi.",
  },
  {
    step: "03",
    name: "Veille",
    line: "Une fois par an, nous vous écrivons — même si rien n'a changé. Surtout si rien n'a changé.",
  },
] as const;

const PAROLES = [
  {
    quote: "Nous n'avons jamais vu de centre d'appel.",
    who: "Famille M., cliente depuis 2003",
  },
  {
    quote: "Ils m'ont dit non une fois. C'est pourquoi je reste.",
    who: "Famille D. & R., clientes depuis 2011",
  },
  {
    quote: "Tout était prêt avant que nous ayons besoin de le savoir.",
    who: "Famille S., cliente depuis 1998",
  },
] as const;

const CONFIANCE = [
  { name: "Manufacture Vallier", what: "Haute horlogerie, Vallée de Joux", since: "Depuis 1994" },
  { name: "Fondation A. & C. Reymond", what: "Fondation familiale, Genève", since: "Depuis 1990" },
  { name: "Berthier & Fils", what: "Étude notariale, Lyon", since: "Depuis 2001" },
  { name: "Domaine de Châtelard", what: "Vignoble en conversion, Lavaux", since: "Depuis 1998" },
  { name: "Famille von Arx", what: "Troisième génération chez nous", since: "Depuis 1989" },
  { name: "Clinique des Cèdres", what: "Établissement privé, 40 lits", since: "Depuis 2007" },
] as const;

const MEET_TIMES = [
  "Le matin",
  "L'après-midi",
  "Le soir, après 19 h",
  "Écrivez-moi d'abord",
] as const;

function BoutiquePage() {
  // Nuit pilotée par la section discrétion : la scène glisse vers la nuit
  // quand la section est à l'écran (ratio seuil 0.5), en repart sinon.
  const [night, setNight] = useState(false);
  const discretionRef = useRef<HTMLElement>(null);

  // Apparition du voile de navigation après le hero + sections reveals.
  const navRef = useRef<HTMLElement>(null);

  const [sent, setSent] = useState(false);

  useEffect(() => {
    const nav = navRef.current;
    const discretion = discretionRef.current;

    // Navigation : visible dès qu'on a dépassé ~90 vh de scroll.
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const past = window.scrollY > window.innerHeight * 0.9;
        if (nav) {
          if (past) nav.setAttribute("data-visible", "");
          else nav.removeAttribute("data-visible");
        }
        ticking = false;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    // Reveals : chaque section s'éclaire en entrant une seule fois.
    const revealed = new WeakSet<Element>();
    const revealObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !revealed.has(entry.target)) {
            entry.target.classList.add("is-visible");
            revealObserver?.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.15, rootMargin: "-5% 0px -5% 0px" },
    );
    for (const el of document.querySelectorAll(".bt-reveal")) {
      revealObserver.observe(el);
    }

    // Nuit : la scène bascule quand la section discrétion occupe l'écran.
    let nightObserver: IntersectionObserver | undefined;
    if (discretion) {
      nightObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const visible = entry.intersectionRatio >= 0.5;
            setNight(visible);
          }
        },
        { threshold: [0.5] },
      );
      nightObserver.observe(discretion);
    }

    return () => {
      window.removeEventListener("scroll", onScroll);
      revealObserver.disconnect();
      nightObserver?.disconnect();
    };
  }, []);

  const scrollTo = (hash: string) => {
    document.querySelector(hash)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="cache-page">
      <CacheMaskScene
        forwardSrc="/video/a.mp4"
        reverseSrc="/video/a-reverse.mp4"
        nightToggle
        night={night}
        eyebrow="La Digue — Maison de confiance"
        title="La marée"
        lede="Depuis 1987, nous couvrons un nombre que nous ne faisons pas grandir. Le reste est sur le sable ci-dessous."
      />

      <nav ref={navRef} className="bt-nav" aria-label="Navigation de la maison">
        <span className="bt-brand">La Digue</span>
        <div className="bt-links">
          {NAV_LINKS.map((l) => (
            <button key={l.href} type="button" className="bt-link" onClick={() => scrollTo(l.href)}>
              {l.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="bt-main">
        {/* La maison */}
        <section id="maison" className="bt-section">
          <p className="bt-eyebrow bt-reveal">La maison</p>
          <h2 className="bt-heading bt-reveal">
            Fondée en 1987, la maison compte 214 familles. Pour la plupart avec nous depuis une
            génération.
          </h2>
          <p className="bt-body bt-reveal">
            Nous refusons plus de dossiers que nous n'en acceptons. C'est ainsi que nous tenons nos
            promesses.
          </p>
          <p className="bt-quote bt-reveal">La marée est constante ; nos engagements aussi.</p>
        </section>

        {/* Les protections */}
        <section id="protections" className="bt-section">
          <p className="bt-eyebrow bt-reveal">Protections</p>
          <h2 className="bt-heading bt-reveal">Ce que nous couvrons</h2>
          <div className="bt-list">
            {PROTECTIONS.map((p) => (
              <article key={p.name} className="bt-row bt-reveal" tabIndex={0}>
                <p.icon size={22} strokeWidth={1.5} aria-hidden="true" />
                <div className="bt-row-text">
                  <h3 className="bt-row-name">{p.name}</h3>
                  <p className="bt-row-line">{p.line}</p>
                  <p className="bt-more">{p.more}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* La méthode */}
        <section id="methode" className="bt-section">
          <p className="bt-eyebrow bt-reveal">La méthode</p>
          <h2 className="bt-heading bt-reveal">Comme une mer</h2>
          <div className="bt-swells">
            {STEPS.map((s) => (
              <div key={s.step} className="bt-swell bt-reveal">
                <span className="bt-swell-step">{s.step}</span>
                <h3 className="bt-swell-name">{s.name}</h3>
                <p className="bt-swell-line">{s.line}</p>
              </div>
            ))}
          </div>
        </section>

        {/* La discrétion — la section qui pilote la nuit de la scène */}
        <section id="discretion" ref={discretionRef} className="bt-section bt-section--night">
          <p className="bt-eyebrow bt-reveal">Discrétion</p>
          <h2 className="bt-heading bt-reveal">Vos dossiers dormant ici.</h2>
          <p className="bt-body bt-reveal">
            La confiance ne se décrète pas. Elle se garde, la nuit comme le jour.
          </p>
          <div className="bt-night-points">
            <p className="bt-body bt-reveal">Nous n'appelons jamais sans raison.</p>
            <p className="bt-body bt-reveal">
              Vos données ne quittent pas la maison — aucun sous-traitant, aucune revente.
            </p>
            <p className="bt-body bt-reveal">
              Un seul interlocuteur, sa ligne directe, sans assistant ni centre d'appel.
            </p>
          </div>
        </section>

        {/* Les paroles */}
        <section id="paroles" className="bt-section">
          <p className="bt-eyebrow bt-reveal">Paroles</p>
          <h2 className="bt-heading bt-reveal">Ce que disent les familles</h2>
          <div className="bt-quotes">
            {PAROLES.map((p) => (
              <figure key={p.who} className="bt-figure bt-reveal">
                <blockquote className="bt-quote">{p.quote}</blockquote>
                <figcaption className="bt-figcap">{p.who}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        {/* Ils nous ont fait confiance */}
        <section id="confiance" className="bt-section">
          <p className="bt-eyebrow bt-reveal">Confiance</p>
          <h2 className="bt-heading bt-reveal">Ils nous ont fait confiance</h2>
          <p className="bt-body bt-reveal">
            Maisons et familles que nous ne citons qu'avec leur accord — la liste est plus longue
            que la page.
          </p>
          <ul className="bt-trust">
            {CONFIANCE.map((c) => (
              <li key={c.name} className="bt-trust-row bt-reveal">
                <span className="bt-trust-name">{c.name}</span>
                <span className="bt-trust-what">{c.what}</span>
                <span className="bt-trust-since">{c.since}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Le premier contact */}
        <section id="rendez-vous" className="bt-section">
          <p className="bt-eyebrow bt-reveal">Le premier contact</p>
          <h2 className="bt-heading bt-reveal">Où vous rejoindre</h2>
          <p className="bt-body bt-reveal">
            Sur rendez-vous seulement, au cabinet ou ailleurs — là où vous serez tranquille.
          </p>
          {sent ? (
            <p className="bt-form-done bt-reveal is-visible">
              Bien reçu. La maison vous répond sous 24 heures — au téléphone, par nous-mêmes.
            </p>
          ) : (
            <form
              className="bt-form bt-reveal"
              onSubmit={(event) => {
                event.preventDefault();
                setSent(true);
              }}
            >
              <label className="bt-field">
                <span className="bt-label">Comment vous appeler ?</span>
                <input type="text" name="nom" className="bt-input" required />
              </label>
              <label className="bt-field">
                <span className="bt-label">Quand peut-on vous joindre ?</span>
                <select name="moment" className="bt-input" defaultValue="">
                  <option value="" disabled>
                    À tout moment
                  </option>
                  {MEET_TIMES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="bt-submit">
                Prendre le temps
              </button>
            </form>
          )}
        </section>
      </main>

      <footer className="bt-footer">
        <p className="bt-footer-quote">La marée est constante ; nos engagements aussi.</p>
        <p className="bt-footer-line">
          Membre FINMA — chemin des Vignes 3, 1204 Genève — © 1987–2026 La Digue
        </p>
      </footer>
    </div>
  );
}
