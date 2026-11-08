---
title: Règles transverses
sidebar_position: 7
---

Règles tranchées avec la direction ; elles s'appliquent à tout le produit et sont détaillées dans la page indiquée.

| Règle | Détail |
|---|---|
| Les fichiers Excel **ajoutent** des données, ils ne **modifient** jamais | [Imports](domaines/imports.md) |
| Toute modification d'une donnée existante se fait depuis l'interface | [Imports](domaines/imports.md), page de chaque domaine |
| La synchronisation des chantiers **ajoute** les chantiers manquants, rien d'autre | [Chantier](domaines/chantier/index.md) |
| La paie **n'est pas calculée** : le total est saisi ou importé tel quel | [Paie](domaines/paie/index.md) |
| Aucun doublon dans les référentiels (comparaison insensible à la casse) | [Modèle de données](architecture/modele-de-donnees.md) |
| Une permission par action ; jamais un rôle codé en dur | [Droits](domaines/rbac/index.md) |
| Chaque écran et chaque bouton d'action est conditionné par une permission | [Frontend](frontend/index.md) |
| Les tableaux sont triables, redimensionnables, réordonnables, configurables, avec filtres en temps réel | [Frontend](frontend/index.md) |
| Toute écriture et tout export laissent une trace (qui, quoi, quand, d'où, avant / après) ; l'application ne peut pas réécrire l'audit | [Audit](domaines/audit/index.md) |

Le suivi des sujets ouverts est dans Jira (projet `KAN`).
