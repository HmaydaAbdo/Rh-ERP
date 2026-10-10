# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Les utilisateurs de **Staport RH** (`erp-rh`) sont ceux d'une entreprise marocaine de travaux publics (BTP) :

- **RH et paie, au bureau, sur PC** — usage dominant : tables longues (bulletins, employés), imports Excel mensuels,
  exports PDF/Excel, corrections ligne à ligne.
- **Administrateurs de chantier, sur PC ou tablette** — consultation et saisie ponctuelle, parfois depuis une baraque
  de chantier.
- **Direction, en consultation** — lit surtout la vue Analytique et le rapport PDF de synthèse.
- **Téléphone** — usage réel confirmé par le propriétaire, pas seulement une contrainte de largeur d'écran.

Les droits sont portés par des rôles et des permissions (RBAC) : un utilisateur en lecture seule voit les données sans
aucun bouton d'action.

## Product Purpose

Gérer le personnel, le pointage et la paie de Staport : référentiels (fonctions, chantiers, équipes), employés,
bulletins de paie mensuels (saisie, import/export Excel, rapport PDF de synthèse), comptes, rôles, permissions et
journal d'audit. Réussir, c'est qu'un employé RH retrouve, corrige et exporte la paie d'un mois sans erreur, vite, et
que la direction lise la masse salariale par chantier sans aide. Le domaine Pointage reste à construire.

## Positioning

Un ERP RH construit pour la réalité d'un groupe de travaux publics marocain : paie par chantier et par équipe,
mois par mois, avec les notions du métier (STC / sorties, jours de récupération, équipes de chantier), plutôt qu'un
outil RH généraliste.

## Operating Context

- Interface **en français** uniquement ; montants en dirhams (DH), format `fr-FR`.
- Travail sur de longues tables paginées côté serveur (tri, colonnes configurables, filtres en temps réel).
- Trois vues de la paie : tabulaire, cartes (mois → chantiers → équipes), analytique ; une même barre de filtres, remise
  à zéro quand on change de vue.
- Documents produits : exports Excel, rapport PDF de synthèse (logo Staport en en-tête).

## Capabilities and Constraints

- Stack imposée par `conventions/frontend.md` : Angular 22 (composants standalone, signaux, zoneless), Angular Aria/CDK, Lucide, Tailwind 4, RxJS, SCSS,
  Chart.js. Toute valeur de design vient de `src/styles/_tokens.scss` (jamais en dur dans un composant).
- Un redesign garde **toutes** les fonctions, routes, permissions, champs de formulaire et comportements : seuls
  l'apparence, la mise en page, la réactivité, le mouvement et la friction d'usage changent.
- Budget de style SCSS par composant : 8 ko (avertissement) / 16 ko (erreur) dans `angular.json`.
- Thèmes clair et sombre à fournir.

## Brand Commitments

- **Nom** : Staport (« Société de Travaux d'Assainissement, Ponts et Routes », S.A.) ; produit : **Staport RH**.
- **Identité existante à respecter** (confirmé par le propriétaire : « j'ai un logo / des couleurs ») : le logo
  `backend/src/main/resources/report/paie/logo-staport.png` (PNG 395×200, fond transparent) — une grande lettre « S »
  porteuse d'une pointe triangulaire, le mot STAPORT en capitales à empattements, « S.A » et la ligne de signature ;
  **bleu marine dominant ≈ `#084478`** relevé sur le fichier.
- Marque bâtie autour du **bleu et de ses variantes**.
- *À confirmer avec le propriétaire* : ce logo est-il bien la version de référence, et existe-t-il un fichier vectoriel
  (SVG) ou d'autres couleurs de charte ?

## Evidence on Hand

- Logo PNG ci-dessus (seul actif de marque trouvé dans le dépôt). Aucun SVG, aucune charte écrite, aucune photo de
  chantier dans le dépôt : ne rien inventer de tel.
- Données réelles de paie en base (utilisateurs, chantiers, équipes) disponibles via le backend local.

## Product Principles

1. **Lisibilité avant expression** : un outil de travail quotidien sur de longues tables ; la marque vit dans les
   détails précis, pas dans la décoration.
2. **Cohérence entre écrans** : un seul style de tableau, une seule barre de filtres, un seul sélecteur — jamais de
   variante locale.
3. **Simplicité pour l'utilisateur final** : peu d'états à comprendre ; l'interface se remet à zéro plutôt que de
   porter un contexte caché d'une vue à l'autre.
4. **Aucune fonction perdue** : la refonte change l'apparence, jamais le comportement ni les droits.
5. **Sûr par défaut** : les actions destructives (suppression en groupe) restent explicites et confirmées.

## Accessibility & Inclusion

- Contraste suffisant dans les deux thèmes ; respect de `prefers-reduced-motion` (déjà appliqué aux animations
  existantes) ; navigation clavier et libellés ARIA conservés.
- Utilisable sur écran de bureau, tablette et téléphone (390 px).
