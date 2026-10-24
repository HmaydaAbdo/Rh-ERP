# ADR 0011 — Les Cartes et l'Analytique de tous les modules sont des vues partagées par périmètre

- **Statut** : accepté
- **Date** : 2026-10-23
- **Décideur** : propriétaire du projet

## Contexte

Employés et Paie avaient chacun leurs Cartes et leur Analytique, écrites séparément ; Équipe, Fonction et Chantier
n'avaient que des vues de référentiel. Le propriétaire veut que les cinq modules (Paie, Employés, Équipes, Fonctions,
Chantiers) se lisent de la même façon, et que ce soit le pattern de toute l'application :

- des **Cartes hiérarchiques** : le domaine déclare l'ordre des dimensions (chantier, équipe, fonction, puis les employés),
  chaque carte ouverte devient une étape du fil ;
- une **Analytique faite de graphiques**, à la manière de la Paie, qui réunit la paie et les fiches Employé ;
- des **filtres communs** aux trois vues d'un module, dont les valeurs suivent quand on passe de l'une à l'autre.

Les conventions interdisaient « une coque générique configurable » pour les trois vues. Cela visait la coque (titre,
sélecteur de vue, actions, barre de filtres), qui reste propre à chaque module. Dupliquer cinq fois ~1 200 lignes de Cartes
et d'Analytique n'était pas tenable : chaque évolution (une mesure, un droit, un correctif d'accessibilité) aurait dû être
reportée cinq fois.

## Décision

1. **Deux composants partagés** — `CartesPerimetreComponent` et `AnalytiquePerimetreComponent`, dans `portail/perimetre/` —
   portent tout le contenu des vues Cartes et Analytique. Ils ne connaissent aucun module : ils lisent la description
   `ModulePerimetre` qu'on leur donne.
2. **Décision historique remplacée pour la coque et le Tabulaire par l'ADR 0012.** Chaque module garde ses routes, filtres, données et contrats métier, et configure les composants partagés de coque et de Tabulaire. Il ajoute un fichier `<module>-module.ts`
   (sa dimension et son référentiel éventuels, les critères que ses filtres produisent) et deux composants hôtes minces. Un
   hôte peut projeter un gabarit `#actionsCarte` pour ajouter ses propres boutons à chaque carte (suppression en groupe de la
   paie).
3. **Le périmètre vit dans l'URL** : `chantierIds`, `equipeIds` (`0` = sans équipe), `fonctionIds` et `periode`. Les filtres
   propres au module s'y ajoutent sans jamais les remplacer ; les valeurs invalides sont ignorées. Le passage d'une vue à
   l'autre conserve le périmètre. Le paramètre historique `par` est ignoré; la hiérarchie suit l'ordre configuré par le domaine
   (voir ADR 0014).
4. **Les sources sont les contrats existants** : `POST /employees/regroupements`, `/employees/analytique`, `/paie/analytique`,
   `/paie/periodes/search`, `/paie/effectifs`, plus le référentiel du module. Aucun endpoint ne change, sauf `parFonction`
   de `/paie/analytique` qui porte désormais les STC. Chaque source n'est lue qu'avec son droit (`EMPLOYEE_READ`,
   `PAIE_READ`) et une source en panne n'efface pas les autres.
5. **Les filtres propres au module bornent tout l'écran**, y compris l'Analytique : le référentiel filtré donne les
   identifiants passés aux fiches et à la paie ; si aucun élément ne correspond, aucune source n'est interrogée.
6. **Le module Paie** ajoute un premier niveau, la liste des mois, tant qu'aucun mois n'est choisi.
7. La hiérarchie des Cartes et l'ordre des sources de l'Analytique sont configurés par domaine selon l'ADR 0014 ; le niveau
   Cartes avance automatiquement et ne se choisit plus librement.

## Conséquences

- Les anciennes Cartes et Analytique des cinq modules disparaissent ; leurs tests sont repris dans les tests du socle et
  des hôtes. Le fil de navigation de la barre de filtres Paie est supprimé (il double celui des Cartes).
- La comparaison avec le mois précédent s'applique à toutes les cartes de tous les modules, avec le seul mois contigu.
- Un nouveau module obtient les trois vues en écrivant sa description et deux hôtes ; la règle est inscrite dans
  `conventions/frontend.md`, « Cartes par niveaux et Analytique graphique ».
- Le coût est un couplage : une évolution du socle touche les cinq modules. Les tests du socle (fonctions pures, Cartes,
  Analytique) et ceux de chaque description de module doivent donc rester verts avant toute livraison.

## Alternatives écartées

- **Un code par module** : cinq copies à maintenir, divergence assurée.
- **Une classe de base à hériter** : moins lisible qu'une description passée à un composant, et plus difficile à tester.
