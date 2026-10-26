---
name: erp-rh-function
description: Use when changing the ERP-RH Function reference domain, its Excel import, API, UI, or tests.
---

# Skill — domaine Fonction

## Lire avant d'agir

- [README métier](../README.md)
- [Permissions et routes](../../rbac/function.md)
- [Règles communes d'import](../../imports.md)
- `conventions/architecture.md` et `conventions/database.md` pour toute modification technique

## Périmètre

Référentiel des fonctions occupées. Le domaine expose sa façade `IFunctionService` aux autres
domaines ; ceux-ci ne consultent pas son repository directement. L'import Excel a son sous-module
`imports/`.
La collection utilise la coque, le Tabulaire, les Cartes et l'Analytique partagés; la configuration Fonction garde sa hiérarchie
`Fonction → Chantier → Équipe`, utilise uniquement la Paie dans les deux vues de synthèse, fixe la période au dernier mois enregistré et trie les cartes par masse puis effectif.
Dans Cartes, le mois, le résumé du périmètre et son export PDF sont réunis dans l'en-tête du niveau.

## Couches et points de contrôle

Le détail de chaque couche est dans le [README Fonction](../README.md#les-couches-du-domaine). Avant de modifier le domaine,
repérer la couche touchée et vérifier ses points de contrôle.

| Couche | Ce qu'elle contient | À vérifier quand on la modifie |
|---|---|---|
| **Application** | `FunctionController`, `FunctionImportController`, `FunctionService` / `IFunctionService`, `FunctionSpecification`, import atomique à une colonne, audit (`FONCTION_*`, `PerimetreImportFunction`), migrations `V23`, `V27`, `V31` ; côté Angular `portail/function/` | Unicité du libellé sans casse (service **et** base) ; suppression refusée si un employé ou un bulletin la référence ; création implicite par l'import Paie avec les mêmes règles ; version optimiste ; une permission par route ; entrée d'audit pour chaque écriture |
| **Analytique** | `function-module.ts` (dimension `FONCTION`, parcours Fonction → Chantier → Équipe, source `PAIE`, tri masse puis effectif), `POST /paie/analytique` (`parFonction`, `evolution`, `qualite`) | Fonction lue sur le **bulletin** du mois, pas sur la fiche Employé ; dernier mois de paie fixe ; mois sans bulletin = zéros et message ; comparaison indisponible plutôt que zéro ; sans `PAIE_READ` aucun appel |
| **IA** | Outils MCP `fonction_rechercher`, `fonction_fiche`, `paie_repartition` (`FONCTION`), filtres `fonctionIds` des outils Paie et Employé ; suggestions et contexte de l'écran `/functions` | Lecture seule ; permission `FUNCTION_READ` / `PAIE_READ` par outil ; description d'outil à jour ; chaque nombre vérifié contre les outils ; salaire réservé à `PAIE_READ` ; pas de périmètre par fiche de poste avant J2 |


## Garde-fous

- Le README métier et les migrations Flyway sont les sources des règles et du schéma : ne pas
  déduire de comportement depuis cette skill.
- Garder uniques les libellés selon les règles documentées et respecter les blocages de suppression.
- L'import est régi par `docs/imports.md` et le RBAC détaillé ; ne pas transformer un import d'ajout
  en mise à jour implicite.
- Garder les actions d'export dans les composants partagés : le Tabulaire exporte tout le résultat filtré et ses colonnes visibles;
  Cartes et Analytique exportent le contenu du composant concerné.
- Les cartes et l'Analytique Fonction reposent sur les bulletins Paie du mois récent; ne pas y introduire les fiches Employé ni des filtres de période.
- Le graphique de répartition masque les catégories à valeur nulle pour l'indicateur choisi; le tableau voisin conserve les catégories complètes.
- Le graphique d'anneau des bulletins sans équipe reste dans sa section Analytique dédiée, avec filtres Chantier/Fonction; ne pas le réintroduire dans Cartes ou la coque.
- Ce graphique qualité est distinct des graphiques de répartition et n'est pas présent dans le Tabulaire. Il apparaît seulement si le dernier mois contient des bulletins sans équipe.
- Réutiliser la présentation de `CartesPerimetreComponent` et ses réglages par `ModulePerimetre`; tout indicateur ajouté doit découler des règles Fonction documentées.
- Garder l'icône Employés à droite du titre de niveau dans Cartes pour les utilisateurs `EMPLOYEE_READ`; elle ouvre la liste avec le périmètre courant sans charger les fiches dans ces synthèses.
- Mettre à jour `docs/rbac/function.md` si une route, une permission ou un contrôle UI change ; mettre
  à jour `docs/data-model.md` si le schéma change.

## Vérification

Exécuter les tests unitaires et d'intégration concernés, y compris les cas de doublon, référence
existante, import atomique et accès refusé. Vérifier migration Flyway sur base vide si le schéma change.
Vérifier aussi le parcours des trois vues et l'export PDF de la liste complète filtrée; synchroniser le README et le PV global
avec le code réellement livré.

## Sélecteurs et revue visuelle

Réutiliser exclusivement le contrôle partagé pour les listes simples et multiples, avec recherche et
options au défilement. Afficher Fonction par libellé, Équipe par code et libellé, Chantier par code et
nom (désignation si le nom est absent). Vérifier les trois vues dans les deux thèmes et sur téléphone,
le changement de source des options, les exports et les filtres conservés dans l'URL.
