import { createFileRoute } from '@tanstack/react-router';
import { meta } from '@/components/portfolio';

export const Route = createFileRoute('/nav-bulle')({
  head: () => meta('Bulle de navigation — démo CSS anchor positioning', 'Recopie du pen de Kevin Powell (QwbRxNw) : le souligné se déforme en bulle autour du lien survolé, sans aucun JavaScript.'),
  component: PenNavDemo,
});

/* ------------------------------------------------------------------ */
/* Démo 1:1 du pen de Kevin Powell (codepen.io/kevinpowell/pen/QwbRxNw) */
/* : deux navs identiques, souligné-ancre qui se déplie en pilule au    */
/* survol — tout le CSS est dans styles.css, section « PEN NAV BULLE ». */
/* ------------------------------------------------------------------ */
const ITEMS = ['Home', 'About', 'Our team'];

function PenNavDemo() {
  return (
    <div className="pen-stage">
      {[0, 1].map((n) => (
        <nav key={n}>
          <ul>
            {ITEMS.map((label) => (
              <li key={label}>
                <a href="#">{label}</a>
              </li>
            ))}
          </ul>
        </nav>
      ))}
    </div>
  );
}
