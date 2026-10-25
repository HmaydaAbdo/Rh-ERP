---
name: erp-rh-chantier
description: Use when changing the ERP-RH Chantier domain, its ERP synchronization, API, UI, or tests.
---

# Skill — domaine Chantier

## Lire avant d'agir

- [README métier](../README.md)
- [Permissions et routes](../../rbac/chantier.md)
- `conventions/architecture.md`, `conventions/database.md` et `conventions/audit.md` selon le changement

## Périmètre

Référentiel des chantiers alimenté par l'ERP source. La synchronisation est un adaptateur du domaine
et la façade `IChantierService` est le point d'accès pour les autres domaines.
Les vues Tabulaire, Cartes et Analytique utilisent la coque et les composants de collection partagés.
Cartes descend Chantier → Équipe → Fonction. Cartes et Analytique prennent exclusivement les bulletins
du dernier mois de paie enregistré pour les indicateurs. L'Analytique répartit les quatre indicateurs
par chantier et suit leur évolution mensuelle pour un chantier, avec filtres Fonction et Équipe.

## Garde-fous

- Respecter la règle documentée de synchronisation : ajouter les chantiers manquants sans écraser
  les données modifiées dans ERP-RH.
- Ne pas supposer qu'un chantier absent de la source doit être désactivé ou supprimé.
- Distinguer le déclenchement planifié du déclenchement manuel et appliquer le RBAC documenté au
  déclenchement manuel.
- Toute modification des données, permissions, audit ou contrat externe met à jour les documents
  concernés dans le même changement.
- Garder les filtres de périmètre dans l'URL et les conserver entre les trois vues. Un chantier clôturé
  reste consultable ; ne pas substituer l'état de la fiche Employé aux chiffres des bulletins.
- Dans la barre latérale, Carte est en première position. Chantier reste une entrée métier distincte ;
  Fonctions et Équipes sont dans « Référentiel RH » et les écrans d'administration dans « Administration système ».

## Vérification

Tester les cas source indisponible, code déjà connu, nouveau chantier et erreur partielle selon les
contrats existants ; vérifier les métriques, logs et permissions touchés.
Pour les vues, vérifier la paie récente, le tri des cartes par masse puis effectif, le passage entre
onglets, les filtres Fonction/Équipe, la qualité des bulletins sans équipe, les exports PDF et les états
sans droit `PAIE_READ`.
