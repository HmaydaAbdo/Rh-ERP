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

Règle métier validée pour l'import : la création d'un bulletin est distincte de la mise à jour de la
fiche Employé. Un salaire identique à celui de la fiche (dernier salaire connu) passe automatiquement;
un salaire différent passe par le wizard, avec type proposé (`≤ 500` journalier, `> 500` mensuel).
Un bulletin existant n'est jamais écrasé sans confirmation auditée; les départs, STC et suppressions
d'affectation ne sont pas déduits automatiquement.

Les montants nuls sont acceptés. Un `salaireMensuel` nul n'est toutefois jamais silencieux :
l'assistant bloque la poursuite et exige l'action explicite « Ignorer et conserver 0 ». Une erreur de montant doit toujours nommer la ligne Excel, le
champ exact (`salaireMensuel`, `primeRoulageOrdinaire`, `primeRoulageDimanche` ou `salaireTotal`),
la valeur reçue et la contrainte violée; le message global « salaires et primes » est interdit.
