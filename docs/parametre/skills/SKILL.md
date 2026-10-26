---
name: erp-rh-parametre
description: Use when changing the fixed parameter catalogue, administration screen, typed readers, or parameter validation in ERP-RH.
---

# Skill — domaine Paramètres

## Lire avant d'agir

- [README Paramètres](../README.md) : règles, catalogue, modèle, DTO et scénarios.
- [Permissions](../../rbac/parametre.md).
- `conventions/configuration.md`, `conventions/jpa.md` et `conventions/audit.md`.

## Garde-fous

- Le catalogue de clés, types et bornes est fixe ; seules les valeurs se modifient depuis l'écran.
  N'ajouter une clé qu'en présence d'un besoin confirmé et d'une valeur initiale documentée.
- Les valeurs ne possèdent aucun repli silencieux ; une clé manquante est une installation incomplète.
- Conserver la version optimiste et l'audit atomique de chaque modification. Les valeurs mémorisées
  ne s'invalident qu'après validation de la transaction.
- `PARAMETRE_READ` ouvre l'écran ; `PARAMETRE_WRITE` rend la saisie et l'enregistrement disponibles.
- Aligner validation API et formulaire : entier décimal, bornes inclusives, valeur non blanche et
  taille maximale de 255 caractères. Spring valide l'expression cron.
- Chaque ligne garde son enregistrement indépendant ; ne pas écraser une saisie voisine lors d'un succès.

## Vérification

Exécuter `CleParametreTest`, `ParametreServiceTest`, les specs des paramètres et la sécurité des endpoints.
Vérifier lecture seule, erreur/réessai, valeur invalide, version périmée et consommateur du paramètre modifié.
