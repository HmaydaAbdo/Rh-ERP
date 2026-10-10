---
name: erp-rh-paie
description: Use when changing payroll records, imports, exports, analytics, or payroll permissions in ERP-RH.
---

# Skill — domaine Paie

## Lire avant d'agir

- [README métier](../README.md)
- [Permissions et routes](../../rbac/paie.md)
- [README Report/BI](../../report/README.md) pour les rapports et projections
- [README Audit](../../audit/README.md) pour les écritures ou exports audités
- [Règles d'import](../../imports.md), si l'import est concerné

## Périmètre

Bulletins mensuels, import, recherche et export. Le calcul automatique de paie n'est pas une règle
implicite : appliquer uniquement ce qui est spécifié dans le README métier.

## Garde-fous

- Respecter l'unicité employé × période, l'immutabilité des identifiants historiques et les
  snapshots documentés de Fonction, Chantier et Équipe.
- Ne jamais recalculer `salaireTotal` ou déduire une formule métier non documentée.
- Séparer `PAIE_DELETE` et `PAIE_PURGE`. Les sélecteurs inter-domaines nécessitent aussi les
  permissions de lecture indiquées dans le RBAC.
- Tout export ou suppression respecte l'audit ; ne pas inclure de données personnelles réelles dans
  les tests ou prompts IA.

## Vérification

Tester règles de période, montants et bornes, unicité, imports, filtres, permissions et cohérence des
exports. Valider les KPI avec les fixtures de référence documentées, sans dupliquer leur formule.
