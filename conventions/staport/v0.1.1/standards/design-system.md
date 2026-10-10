# Design system Staport — Intelligent Operations

## Intention visuelle

Partir du bleu du logo Staport comme ancrage, puis créer une interface d'opérations précise,
immersive et calme : hiérarchie typographique forte, données lisibles, surfaces en profondeur
maîtrisée, graphiques utiles et accent lumineux réservé aux actions/insights. L'effet futur vient de
la qualité des interactions, de la visualisation et du mouvement, pas d'une couche de néon/glassmorphism
sur chaque panneau.

## Système

- Tokens à trois niveaux : primitives de marque → tokens sémantiques (surface, texte, action,
  statut, focus) → tokens de composants. Deux thèmes et un mode contraste ; aucune valeur de design
  arbitraire dans un composant.
- Mesurer le contraste du bleu réel du logo avant de l'utiliser sur tous les fonds. Garder les
  couleurs de statut distinctes de la marque et toujours accompagnées d'un libellé/icône.
- Tailwind CSS 4 fournit les utilitaires de composition ; encapsuler les motifs répétés dans des
  composants et classes sémantiques Staport. Lucide Angular pour les icônes. Angular Aria/CDK pour
  clavier, focus, overlay, listbox/combobox, drag/drop et virtualisation quand approprié.
- Chaque composant définit états normal, hover, focus-visible, actif, désactivé, chargement, erreur
  et haute densité. Cibles tactiles adaptées et responsive sans défilement horizontal global.
- Mouvement court, informatif, non bloquant et gouverné par tokens ; réduire/neutraliser selon
  `prefers-reduced-motion`. Réserver les animations élaborées à des récits de données/transition
  réellement utiles et mesurer leur impact sur FPS et batterie.
- Graphiques : une question claire, unités/période/source, palette compatible daltonisme, alternative
  tabulaire et interaction clavier.

## Direction produit

Proposer un cockpit intelligent : recherche/commande globale, vue de travail par rôle, cartes KPI
avec période et définition, explication d'anomalie avec source, panneau agent contextuel et actions
qui demandent une confirmation avant écriture. L'IA montre statut, sources, outils appelés et
approbation ; elle n'éclipse pas le parcours métier classique. Pas de chiffres prédictifs présentés
comme certitudes.
