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
