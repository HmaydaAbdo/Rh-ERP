---
sidebar_position: 7
---

# Migration du domaine employee

Le portage FastAPI du domaine `employee` commence dans KAN-225 sur l'application unique. Le premier lot couvre le modèle
SQLAlchemy, validation des dates et affectations, CRUD REST, recherche paginée, verrou optimiste, RBAC et audit.

Le salaire et le type de salaire sont projetés uniquement avec `PAIE_READ`; les autres lecteurs ne peuvent ni les voir ni
les modifier. Les outils MCP de lecture `employes_rechercher` et `employe_fiche` suivent la même règle de périmètre.

L'import Excel, l'analytique, les sorties mensuelles et le rejeu de parité Spring restent à livrer avant la clôture de
KAN-225.
