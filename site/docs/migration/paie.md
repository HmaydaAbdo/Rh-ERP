# Migration Paie vers Python

KAN-226 ouvre la migration du domaine Paie dans l'application FastAPI unique.

La première tranche porte le socle des bulletins : modèle SQLAlchemy aligné sur `paie`, création,
modification avec verrou optimiste, lecture, recherche paginée et suppression unitaire. Les routes
sont montées sous `/paie` et protégées par `PAIE_READ`, `PAIE_WRITE` ou `PAIE_DELETE`.

Le périmètre restant avant clôture comprend l'import Excel atomique, les options chantier/équipe,
l'analytique et les effectifs, le parcours employé, les exports/rapport, la suppression-restauration
de groupe, les outils MCP et la parité des tests Spring documentés dans `docs/paie/skills/SKILL.md`.

Le calcul automatique n'est pas introduit : `salaire_total` reste une valeur fournie par le contrat
du bulletin, conformément au domaine existant. Les snapshots historiques et l'unicité employé ×
période restent des invariants de la table.
