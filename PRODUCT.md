# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Bureau RH et paie** (ordinateur, sessions longues, usage quotidien) : saisie, import et contrôle de la paie, suivi des employés, des équipes et des heures supplémentaires.
- **Chefs de chantier** (téléphone, sur le terrain, plein soleil, une main, réseau variable) : consultation et petites saisies.
- **Direction** (lecture et pilotage, usage ponctuel) : tableaux de bord, cartes des chantiers, analyses.
- **Administrateurs** : rôles, permissions, audit, paramètres.

Confirmé par le propriétaire le 2026-10-31.

## Product Purpose

ERP-RH est le système de gestion du personnel, du pointage et de la paie de Staport, entreprise du BTP (bâtiment et travaux publics) au Maroc. Il réunit employés, équipes, fonctions, chantiers, paie, heures supplémentaires, audit et paramètres, plus un assistant IA qui répond aux questions à partir des données de l'ERP. Le succès : une paie juste, des chiffres lisibles du premier coup d'œil, et des utilisateurs qui aiment s'en servir.

## Positioning

Un ERP RH conçu pour un chantier réel : paie, effectifs et chantiers dans un seul outil, avec une carte des chantiers au Maroc et un assistant qui lit les mêmes données avec les mêmes droits que l'utilisateur.

## Operating Context

- Données RH et de paie réelles, soumises à la loi marocaine 09-08.
- Navigateur sur ordinateur et sur téléphone ; thèmes clair et sombre.
- Interface en français ; l'arabe, de droite à gauche, est prévu plus tard (à préparer dans la structure sans le livrer).
- Application Angular existante (voir `frontend/`), avec un design system à jetons (`conventions/design-system.md`) et des composants partagés.

## Capabilities and Constraints

- Domaines : `employee`, `equipe`, `function`, `chantier`, `paie`, `heuresupp`, `audit`, `parametre`, `auth` (rôles et permissions), assistant IA.
- Contrainte du propriétaire : **tous les écrans utilisent des composants partagés**, jamais de composant propre à un domaine.
- Contrainte du propriétaire : **le texte est toujours clairement visible** (contraste fort, dans les deux thèmes).
- Gratuit et auto-hébergé : aucune police, icône ou bibliothèque payante ou hébergée par un tiers.
- Tableaux officiels prévus : AG Grid Community ; graphiques : `ng2-charts` (décision du 2026-10-31).
- Terminologie métier en français (paie, bulletin, pointage, chantier, équipe, fonction, heures supplémentaires).

## Brand Commitments

- Le nom **Staport** et son **logo** sont conservés.
- Aucune autre contrainte d'identité : couleurs, typographie, formes et composants sont redessinés (décision du propriétaire, 2026-10-31).
- **Charte retenue : le standard de la catégorie, exécuté sans faute** (clair et sombre), avec des **bordures bien visibles, surtout pour les tableaux** ; niveau de finition visé : **Linear, Stripe Dashboard et Notion** (décision du 2026-10-31). Détail dans `conventions/design-system.md`.
- Le propriétaire veut que l'utilisateur **tombe amoureux** de l'interface et s'y sente **à l'aise**.

## Evidence on Hand

- Application réelle avec données de paie et de chantiers réelles en base.
- Aucun témoignage, aucune étude utilisateur, aucun chiffre d'adoption : à ne pas inventer.

## Product Principles

1. **Lisibilité d'abord** : aucun texte n'est jamais difficile à lire, quel que soit le thème, l'appareil ou la lumière.
2. **Confort durable** : un outil de travail quotidien, calme pendant des heures, jamais fatigant ni bruyant.
3. **Un seul vocabulaire de composants** : l'écran d'un domaine est composé de composants partagés ; ce qui manque s'ajoute au système, pas à l'écran.
4. **Affection par le soin** : l'attachement vient des détails (états, transitions, vides, erreurs), pas de décorations.
5. **Les chiffres sont la vérité** : mise en forme et hiérarchie servent la lecture des montants, des dates et des statuts.

## Accessibility & Inclusion

- Contraste élevé du texte (AA au minimum, viser plus pour le texte courant) dans les deux thèmes.
- Utilisable au clavier, avec focus visible, et avec mouvement réduit.
- Lisible en plein soleil sur téléphone (chefs de chantier).
- Propriétés logiques (pas de gauche/droite en dur) pour préparer l'arabe de droite à gauche.
