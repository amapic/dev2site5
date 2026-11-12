import { useEffect, useState } from 'react';
import { inkEdgeDefaults, inkEdgeSettings, type InkEdgeSettings } from '@/components/ink-blob-image';

/* ------------------------------------------------------------------ */
/* HUD de réglage live du bord « encre » des patatoïdes.               */
/* Ouverture : bouton flottant « Encre », touche « i », ou « ?hud ».    */
/* Chaque instance InkBlobImage relit les réglages à chaque frame.      */
/* ------------------------------------------------------------------ */

type NumericKey = { [K in keyof InkEdgeSettings]: InkEdgeSettings[K] extends number ? K : never }[keyof InkEdgeSettings];

type SliderDef = { key: NumericKey; label: string; min: number; max: number; step: number };

const SLIDERS: SliderDef[] = [
  { key: 'baseRadius', label: 'Taille du patatoïde', min: 0.15, max: 0.49, step: 0.005 },
  { key: 'harm', label: 'Irrégularité de forme', min: 0, max: 0.3, step: 0.005 },
  { key: 'power', label: 'Pression du front', min: 1, max: 8, step: 0.1 },
  { key: 'softness', label: 'Douceur du bord', min: 0.01, max: 0.3, step: 0.005 },
  { key: 'spread', label: 'Concentration taches au bord', min: 1, max: 12, step: 0.1 },
  { key: 'soakDist', label: 'Plénitude intérieure (soak)', min: 0.05, max: 0.5, step: 0.005 },
  { key: 'rimLag', label: 'Épaisseur liseré', min: 0, max: 0.4, step: 0.005 },
  { key: 'edgeTint', label: 'Intensité liseré', min: 0, max: 1, step: 0.01 },
  { key: 'pulse', label: 'Respiration', min: 0, max: 0.12, step: 0.002 },
  { key: 'pulseSpeed', label: 'Vitesse respiration', min: 0, max: 2, step: 0.05 },
  { key: 'drift', label: 'Dérive du bruit', min: 0, max: 0.08, step: 0.002 },
  { key: 'driftSpeed', label: 'Vitesse dérive', min: 0, max: 1, step: 0.02 },
  { key: 'noiseScale', label: 'Échelle du grain', min: 1, max: 6, step: 0.05 },
  { key: 'octaves', label: 'Octaves', min: 1, max: 8, step: 1 },
  { key: 'contrast', label: 'Contraste taches', min: 0, max: 1, step: 0.01 },
];

export function InkDebugHud() {
  const [open, setOpen] = useState(
    () => new URLSearchParams(window.location.search).has('hud') || localStorage.getItem('ink-hud') === '1',
  );
  // Les réglages vivent dans inkEdgeSettings (source de vérité lue par le shader) ;
  // ce compteur ne sert qu'à rafraîchir l'affichage des valeurs.
  const [, force] = useReducerTick();

  useEffect(() => {
    if (!open) {
      localStorage.removeItem('ink-hud');
      return;
    }
    localStorage.setItem('ink-hud', '1');
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'i' && !e.metaKey && !e.ctrlKey && !e.altKey && !(e.target instanceof HTMLInputElement)) {
        setOpen(open => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const numeric = inkEdgeSettings as unknown as Record<NumericKey, number>;
  const set = <K extends NumericKey>(key: K, value: number) => {
    numeric[key] = key === 'octaves' ? Math.round(value) : value;
    force();
  };

  return (
    <div className={`ink-hud${open ? ' ink-hud-open' : ''}`}>
      <button type="button" className="ink-hud-toggle" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        Encre
      </button>
      {open && (
        <div className="ink-hud-panel" data-lenis-prevent>
          {SLIDERS.map(({ key, label, min, max, step }) => (
            <label key={key} className="ink-hud-row">
              <span className="ink-hud-label">{label}</span>
              <input
                className="ink-hud-slider"
                type="range"
                min={min}
                max={max}
                step={step}
                value={numeric[key]}
                onChange={(e) => set(key, Number(e.target.value))}
              />
              <output className="ink-hud-value">{numeric[key].toFixed(step >= 1 ? 0 : 3)}</output>
            </label>
          ))}
          <label className="ink-hud-row">
            <span className="ink-hud-label">Couleur liseré</span>
            <input
              className="ink-hud-color"
              type="color"
              value={inkEdgeSettings.ink}
              onChange={(e) => {
                inkEdgeSettings.ink = e.target.value;
                force();
              }}
            />
          </label>
          <div className="ink-hud-actions">
            <button
              type="button"
              className="ink-hud-reset"
              onClick={() => {
                Object.assign(inkEdgeSettings, inkEdgeDefaults);
                force();
              }}
            >
              Réinitialiser
            </button>
            <button
              type="button"
              className="ink-hud-copy"
              onClick={() => navigator.clipboard?.writeText(JSON.stringify(inkEdgeSettings, null, 2))}
            >
              Copier les réglages
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function useReducerTick() {
  const [tick, dispatch] = useState(0);
  return [tick, () => dispatch(t => t + 1)] as const;
}
