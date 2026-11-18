import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { GroupeLeonie } from "@/components/project-panels";
import cyclist from "@/assets/cyclist.jpg";
import groupeleonie from "@/assets/groupeleonie.webp";
import uconsulting from "@/assets/uconsulting.webp";
import giulia from "@/assets/giulia.webp";
import stanleygrant from "@/assets/stanleygrant.webp";
import pierrebazin from "@/assets/pierrebazin.jpg";
import mariedurand from "@/assets/mariedurand.jpg";

// Flèche universelle du site : l'image fleche.png (retournée en CSS, le fichier pointe vers le bas)
export function Arrow({ size = 14 }: { size?: number }) {
  return <img src="/fleche.png" alt="" width={40} height={size} className="inline-arrow" />;
}

// Un projet du rail. `panel` : contenu React libre montré dans le patatoïde
// (vue « Aperçu ») à la place des seules métadonnées — chaque projet peut
// passer un JSX différent (texte, composant, etc.), découpé par la forme.
export type Project = {
  id: string;
  title: string;
  category: string;
  year: string;
  image: string;
  description: string;
  panel?: ReactNode;
};

export const projects: Project[] = [
  {
    id: "001",
    title: "Groupe Leonie",
    category: "Corporate",
    year: "2025",
    image: groupeleonie,
    description: "sgsgsfgsfg",
    panel: <GroupeLeonie />,
  },
  {
    id: "002",
    title: "U-Consulting",
    category: "Corporate",
    year: "2026",
    image: uconsulting,
    description: "sfgsfgsfgs",
  },
  {
    id: "003",
    title: "Portfolio de designer UX UI",
    category: "Portfolio",
    year: "2025",
    image: giulia,
    description: "",
  },
  {
    id: "004",
    title: "Site Marchand Shopify",
    category: "E-commerce",
    year: "2026",
    image: stanleygrant,
    description: "sgsfgsfg",
  },
  {
    id: "005",
    title: "Portfolio de photographe",
    category: "Portfolio",
    year: "2024",
    image: pierrebazin,
    description: "sgsgsgs",
  },
  {
    id: "006",
    title: "Site professionel",
    category: "Corporate",
    year: "2025",
    image: mariedurand,
    description: "hhhhhhhhhhhhh",
  },
];
// Coordonnées du footer : laissez vide tant que l'information n'est pas disponible (affiche « À venir »)
export const siteContact = {
  address: "8 rue Sully, 69006 Lyon",
  hours: "Lundi – Vendredi : 9h – 18h",
  phone: "",
  email: "",
  website: { label: "dev2site.net", url: "https://dev2site.net" },
  socials: [
    { label: "Instagram", url: "" },
    { label: "LinkedIn", url: "" },
    { label: "Behance", url: "" },
  ],
};

export function Header({ onImage }: { onImage: boolean }) {
  return (
    <header className={`site-header ${onImage ? "on-image" : ""}`}>
      <Link to="/" className="wordmark">
        amaury<span>©</span>
      </Link>
      <nav className="site-nav" aria-label="Navigation principale">
        <Link to="/" activeOptions={{ exact: true }}>
          Accueil<sup>01</sup>
        </Link>
        <Link to="/labo">
          Labo<sup>04</sup>
        </Link>
        <Link to="/nav-bulle">
          Bulle<sup>05</sup>
        </Link>
        <Link to="/choc">
          Choc<sup>06</sup>
        </Link>
        <Link to="/contact">
          Contact<sup>03</sup>
        </Link>
      </nav>
    </header>
  );
}

// Menu latéral fixé au bord gauche, lu de bas en haut : reproduction du pen de
// Kevin Powell (nav > ul > li > a + CSS anchor positioning), tournée à 90° —
// le souligné reste horizontal dans l'espace du menu, donc à droite des
// labels une fois tourné. Tout est CSS (voir styles.css, section side-nav) :
// plus de bulle pilotée par React.
export function SideNav({ onImage }: { onImage: boolean }) {
  const items = [
    { label: "Accueil", to: "/" },
    { label: "Contact", to: "/contact" },
  ];
  return (
    <nav
      className={`side-nav ${onImage ? "side-nav-on-image" : ""}`}
      aria-label="Navigation latérale"
    >
      <ul>
        {items.map((item) => (
          <li key={item.to}>
            <Link to={item.to} activeOptions={item.to === "/" ? { exact: true } : {}}>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
export function Footer() {
  const pending = "À venir";
  const { address, hours, phone, email, website, socials } = siteContact;
  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <div>
          <span className="footer-label">Contact</span>
          <p>{address || pending}</p>
          {hours && <p>{hours}</p>}
          <p>{phone ? <a href={`tel:${phone.replace(/\s/g, "")}`}>{phone}</a> : pending}</p>
          <p>{email ? <a href={`mailto:${email}`}>{email}</a> : pending}</p>
          <p>
            {website && (
              <a href={website.url} target="_blank" rel="noreferrer">
                {website.label} <Arrow />
              </a>
            )}
          </p>
        </div>
        <div>
          <span className="footer-label">Réseaux</span>
          <ul>
            {socials.map((s) => (
              <li key={s.label}>
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.label} <Arrow />
                  </a>
                ) : (
                  <span>
                    {s.label} — {pending}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <span className="footer-label">Contact</span>
          <p>
            <Link to="/contact" className="text-foreground">
              On en parle ? <Arrow />
            </Link>
          </p>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© 2026 Amaury — Portfolio créatif</span>
        <span>Direction créative digitale · Sites conçus sur dev2site.net</span>
      </div>
    </footer>
  );
}
export function meta(title: string, description: string) {
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  };
}
