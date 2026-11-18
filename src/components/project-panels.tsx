/* Panneaux React personnalisés, un par projet : ils sont rendus DANS le
   patatoïde via <foreignObject> (voir projects[].panel dans portfolio.tsx),
   donc découpés par la forme qui morphe. Garde le wrapper .project-details
   si tu veux la révélation au clic « Aperçu » et la mise en page en bas de
   forme ; sans lui, le contenu est visible en permanence dans la forme.

   ⚠️ À l'intérieur d'un SVG, tout le contenu doit être du HTML « simple » :
   textes, images, listes — pas de position: fixed, pas de portail, et pas de
   hooks pilotés par le scroll de la page (le SVG est transformé). */

export function GroupeLeonie() {
  return (
    <div className="project-details">
      <p className="project-details-id">001</p>
      <h2>Groupe Leonie</h2>
      <p className="project-details-meta">Corporate — 2025</p>
      <p className="project-details-body">
        Idée, texte ou composants libres du projet — tout React est accepté ici.
      </p>
    </div>
  );
}
