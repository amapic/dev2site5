/* ------------------------------------------------------------------ */
/* Formes sculptées (SVG fermés début / fin) par variante de patatoïde.*/
/*                                                                     */
/* Pour sculpter la métamorphose d'un patatoïde du rail :               */
/*   1. Exporter deux SVG fermés depuis l'outil sculpt (canvas          */
/*      1000×1000), ex. public/shapes/blob-0-depart.svg et              */
/*      public/shapes/blob-0-arrivee.svg ;                              */
/*   2. Les déclarer ici, par variante (la variante N correspond à      */
/*      blob-N dans le rail d'accueil).                                 */
/* Un champ absent — ou un SVG introuvable/vide — retombe sur le        */
/* patatoïde harmonique par défaut. Les trous dans le SVG (sous-chemins */
/* à sens inverse) sont gérés comme de l'extérieur.                     */
/* ------------------------------------------------------------------ */

export const INK_SHAPE_URLS: Record<number, { start?: string; end?: string }> = {
  0: { start: '/shapes/blob-0-depart.svg', end: '/shapes/blob-0-arrivee.svg' },
};
