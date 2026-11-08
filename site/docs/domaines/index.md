---
title: Domaines
sidebar_position: 5
---

# Domaines

Pour chaque domaine : la page fonctionnelle et technique (avec son **Guide agent**, consignes condensées pour Claude et Codex), les permissions et routes, et les contrats (DTO, types, contraintes) quand ils existent. Les permissions et outils MCP de l'API doivent tous y figurer : `node scripts/check-docs-domaines.mjs` échoue sinon.

| Domaine | Page | Permissions et routes | Contrats |
|---|---|---|---|
| accueil | [Accueil](accueil/index.md) | [droits](accueil/droits.md) |  |
| audit | [Audit — journal, historique et garde-fous](audit/index.md) | [droits](audit/droits.md) | [contrats](audit/contrats.md) |
| auth | [Module Auth](auth/index.md) | [droits](auth/droits.md) | [contrats](auth/contrats.md) |
| chantier | [Module Chantier](chantier/index.md) | [droits](chantier/droits.md) |  |
| employee | [Domaine Employé](employee/index.md) | [droits](employee/droits.md) |  |
| equipe | [Domaine Équipe](equipe/index.md) |  |  |
| function | [Module Function](function/index.md) | [droits](function/droits.md) |  |
| heures-supp | [Domaine Heures supplémentaires](heures-supp/index.md) | [droits](heures-supp/droits.md) |  |
| paie | [Module Paie](paie/index.md) | [droits](paie/droits.md) | [contrats](paie/contrats.md) |
| parametre | [Paramètres de fonctionnement](parametre/index.md) | [droits](parametre/droits.md) |  |
| rapport | [Rapport et exports Paie](rapport/index.md) |  |  |

Transversal : [RBAC](rbac/index.md) (catalogue des permissions et dépendances de droits) et [imports Excel](imports.md). La carte des chantiers est dans [Chantier](chantier/carte.md).
