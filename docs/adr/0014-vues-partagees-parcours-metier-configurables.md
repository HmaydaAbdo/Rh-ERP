# ADR 0014 — Les vues partagées suivent le parcours métier de chaque domaine

- **Statut** : accepté
- **Date** : 2026-10-23
- **Décideur** : propriétaire du projet

## Contexte

Les composants partagés de Cartes et d'Analytique donnent une présentation uniforme, mais la descente libre et l'ordre
identique des blocs rendent les domaines trop semblables. Un référentiel d'équipes doit commencer par les équipes et leurs
effectifs; la Paie doit commencer par les indicateurs du mois. La coque et les composants visuels restent partagés.

## Décision

1. Chaque domaine déclare une hiérarchie fixe pour Cartes. Ouvrir une carte ajoute l'étape au fil et affiche automatiquement
   le niveau suivant. Le regroupement ne se choisit pas librement dans l'écran.
2. Les Cartes restent partagées et présentent le libellé sémantique du domaine comme nom principal, avec les identifiants
   administratifs en information secondaire lorsqu'ils existent.
3. Chaque domaine déclare l'ordre de ses sources dans Analytique, ainsi que ses libellés spécifiques. Le composant partagé
   affiche d'abord le sujet métier prioritaire; il ne contient aucun branchement sur les clés de domaine.
4. Le contenu de Paie et celui des fiches Employé demeurent dans des blocs distincts. Chacun conserve son droit d'accès et
   ses règles de calcul; l'ordre d'affichage ne change ni le périmètre ni les données.
5. Les filtres communs, les étapes du fil et le mois restent dans l'URL. Les anciens liens avec le paramètre `par` suivent
   la hiérarchie déclarée et n'en changent pas l'ordre.

## Configuration des domaines

| Domaine | Hiérarchie Cartes | Analytique en premier |
|---|---|---|
| Chantiers | chantier → équipe → fonction → employés | fiches Employé |
| Équipes | équipe → chantier → fonction → employés | effectifs et organisation des équipes |
| Fonctions | fonction → chantier → équipe → employés | fiches Employé |
| Employés | chantier → équipe → fonction → employés | fiches Employé |
| Paie | mois → chantier → équipe → fonction → employés | indicateurs Paie |

## Conséquences

- Le socle partagé rend le parcours déterministe et accessible au clavier; chaque domaine garde une lecture qui correspond à sa
  question métier.
- Les tests du socle vérifient que l'ordre ne peut pas être remplacé par une valeur de l'URL, que chaque ouverture progresse
  dans l'ordre configuré et que l'ordre Analytique respecte la configuration du domaine.
- Les README de domaine décrivent leur hiérarchie, leurs indicateurs prioritaires et leurs permissions; la convention frontend
  et la référence des vues partagées décrivent le contrat commun.

## Alternatives écartées

- Le regroupement libre : il permet de sauter des étapes métier et rend les domaines difficiles à distinguer.
- Dupliquer Cartes et Analytique pour chaque domaine : les corrections de cohérence, d'accessibilité et d'export divergent.
