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

## Couches et points de contrôle

Le détail de chaque couche est dans le [README Chantier](../README.md#les-couches-du-domaine). Avant de modifier le domaine,
repérer la couche touchée et vérifier ses points de contrôle.

| Couche | Ce qu'elle contient | À vérifier quand on la modifie |
|---|---|---|
| **Application** | `ChantierController`, `ChantierSyncController`, `ChantierService` / `IChantierService`, `ChantierSpecification`, synchronisation ERP (`sync/` : client, service, une transaction par ligne, planificateur de 23 h, métriques `rh.chantier.sync.*`), audit (`CHANTIER_*`, `PerimetreSynchronisationChantier`), migrations `V5`, `V24`, `V27`, `V28`, `V31`, `V35` ; côté Angular `portail/chantier/` (liste, formulaire, détail, actions, filtres, assistant d'import Paie « Rouvrir le chantier ») | Unicité du code sans casse ; statut `actif` modifié seulement à la main (jamais par la synchronisation) ; suppression refusée si référencé ; synchronisation qui n'**ajoute** que les chantiers manquants ; `CHANTIER_SYNC` pour le déclenchement manuel ; version optimiste ; entrée d'audit pour chaque écriture et chaque synchronisation |
| **Analytique** | `chantier-module.ts` (dimension `CHANTIER`, parcours Chantier → Équipe → Fonction, source `PAIE`, tri masse puis effectif, pastille de statut), `POST /paie/analytique` (`parChantier`, `evolution`, `qualite`), carte géographique `/carte` (`CARTE_READ`, fond seul pour l'instant) | Chantier lu sur le **bulletin** du mois ; dernier mois de paie fixe ; un chantier clôturé garde sa carte ; état « Clôturé » pris sur la fiche, pas déduit de la paie ; comparaison indisponible plutôt que zéro ; sans `PAIE_READ` aucun appel |
| **IA** | Outils MCP `chantier_rechercher` (filtre de statut), `chantier_fiche`, `paie_repartition` (`CHANTIER`), `paie_indicateurs` (`principauxChantiers`), filtres `chantierIds` des outils Paie et Employé ; suggestions et contexte de l'écran `/chantiers` | Lecture seule (jamais de synchronisation ni de clôture par l'assistant) ; permission `CHANTIER_READ` / `PAIE_READ` par outil ; description d'outil à jour ; chaque nombre vérifié contre les outils ; pas de périmètre par fiche de poste avant J2 |


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
