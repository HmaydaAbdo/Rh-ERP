---
name: erp-rh-heures-supp
description: Use when changing the ERP-RH Heures supplémentaires domain, its monthly chantier imports, analytics, or MCP tools.
---

# Skill — domaine Heures supplémentaires

Lire les règles métier et le modèle de données dans [README.md](../README.md), puis les permissions dans
[`docs/rbac/heures-supp.md`](../../rbac/heures-supp.md). Lire aussi le README et le skill Paie pour son assistant
d'import, sa règle STC et ses contrats, ainsi que les conventions de base de données, audit, sécurité, frontend et MCP.

Le domaine identifie les employés par CIN, exige une paie du même mois, importe par chantier, conserve les taux calculés
à l'import, et distingue Montant, STC (DH), Forfait et Net à payer. Ses capacités IA passent par MCP, avec définitions
et unités explicites ; Spring reste la source de tous les calculs.
