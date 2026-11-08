import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { projects, ProjectGrid, meta } from '@/components/portfolio';

// Catégories dérivées des projets, « Tous » en tête.
const CATEGORIES = ['Tous', ...Array.from(new Set(projects.map((p) => p.category)))];

export const Route = createFileRoute('/projets')({
  head: () => meta('Projets — Amaury', 'Une sélection de projets web par Amaury.'),
  component: Projects,
});

function Projects() {
  const [filter, setFilter] = useState('Tous');
  return (
    <main className="page-content">
      <div className="section-top">
        <span>02 — LES PROJETS</span>
        <span>Sélection / 2026</span>
      </div>
      <h1 className="page-title">PROJETS_002</h1>
      <div className="filter-row" aria-label="Filtrer les projets">
        {CATEGORIES.map((f) => {
          const count = f === 'Tous' ? projects.length : projects.filter((p) => p.category === f).length;
          return (
            <Button
              key={f}
              variant={filter === f ? 'default' : 'ghost'}
              size="sm"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              {f} ({count})
            </Button>
          );
        })}
      </div>
      <ProjectGrid filter={filter} />
    </main>
  );
}
