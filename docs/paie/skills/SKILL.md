---
name: erp-rh-paie
description: Use when changing payroll records, imports, exports, analytics, or payroll permissions in ERP-RH.
---

# Skill — domaine Paie

## Lire avant d'agir

- [README métier](../README.md)
- [DTO, types et contraintes](../contrats.md)
- [Permissions et routes](../../rbac/paie.md)
- [README Report/BI](../../report/README.md) pour les rapports et projections
- [README Audit](../../audit/README.md) pour les écritures ou exports audités
- [Règles d'import](../../imports.md), si l'import est concerné

## Périmètre

Bulletins mensuels, import, recherche et export. Le calcul automatique de paie n'est pas une règle
implicite : appliquer uniquement ce qui est spécifié dans le README métier.

## Couches et points de contrôle

Le détail de chaque couche est dans le [README Paie](../README.md#les-couches-du-domaine). Avant de modifier le domaine,
repérer la couche touchée et vérifier ses points de contrôle.

| Couche | Ce qu'elle contient | À vérifier quand on la modifie |
|---|---|---|
| **Application** | `PaieController` et ses services (saisie, suppression, restauration), assistant d'import (`/paie/import/*`), export Excel, rapport PDF, parcours d'un employé ; audit `PAIE_*` ; côté Angular `portail/paie/` | Un bulletin par employé et par mois ; l'affectation du mois reste dans le bulletin ; `PAIE_WRITE` **et** `EMPLOYEE_WRITE` pour la saisie ; import atomique et corrections des fiches ; suppression et restauration auditées |
| **Analytique** | `POST /paie/analytique` (`PaieAnalytiqueDto`), `POST /paie/effectifs`, `/paie/periodes` : source unique des vues Cartes et Analytique de tous les domaines | Ne jamais recalculer une définition ailleurs (effectif, masse, STC, entrées, plus payés, sorties) ; comparaison indisponible plutôt que zéro ; dernier mois importé par défaut ; mêmes définitions que le rapport PDF et l'assistant |
| **IA** | `paie_indicateurs`, `paie_periodes`, `paie_repartition`, `paie_evolution`, `paie_mouvements`, `paie_qualite`, `paie_bulletins_rechercher` (`PAIE_READ`), `rapport_preparer` (`PAIE_EXPORT` + `PAIE_READ`, ne génère aucun fichier) | Lecture seule ; `definitions` de `paie_mouvements` citées ; filtres `chantierIds` / `equipeIds` (`0` = sans équipe) / `fonctionIds` ; descriptions d'outils à jour ; chaque nombre vérifié contre les outils ; le modèle ne calcule rien |

## Garde-fous

- Respecter l'unicité employé × période, l'immutabilité des identifiants historiques et les
  snapshots documentés de Fonction, Chantier et Équipe.
- Ne jamais recalculer `salaireTotal` ou déduire une formule métier non documentée.
- Séparer `PAIE_DELETE` et `PAIE_PURGE`. Les sélecteurs inter-domaines nécessitent aussi les
  permissions de lecture indiquées dans le RBAC.
- Tout export ou suppression respecte l'audit ; ne pas inclure de données personnelles réelles dans
  les tests ou prompts IA.
- Garder la parité API/formulaire/import : jours sur 5 chiffres dont 2 décimales, montants sur 10
  chiffres dont 2 décimales. Refuser une cellule numérique invalide plutôt que la remplacer par une
  absence; les numéros de ligne d'erreur sont ceux d'Excel.
- Les mouvements et les agrégats utilisent les mêmes filtres de nom, CIN et rattachements. Ne pas
  mélanger l'affectation historique du bulletin et l'état courant de la fiche.
- Une lecture en échec ne présente pas de formulaire de modification vide. Annuler les recherches
  obsolètes et vérifier la reprise après erreur sans perdre le périmètre.

## Vérification

Tester règles de période, montants et bornes, unicité, imports, filtres, permissions et cohérence des
exports. Valider les KPI avec les fixtures de référence documentées, sans dupliquer leur formule.
Exécuter les scénarios du README, notamment `PaieRequestValidationTest`, `LecteurFichierPaieTest`,
`PaieRechercheJokersTest` sur PostgreSQL et les specs des vues et assistants concernés.
