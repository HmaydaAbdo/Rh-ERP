# Migration Paie vers Python

KAN-226 ouvre la migration du domaine Paie dans l'application FastAPI unique.

Le modèle SQLAlchemy est aligné sur `paie`. La création, la modification avec verrou optimiste,
la lecture, la recherche paginée et la suppression unitaire sont montées sous `/paie`. Le contrat
HTTP des mois est `AAAA-MM`, tandis que la table conserve `AAAAMM`. Les réponses de bulletin
contiennent les résumés `employee`, `fonction`, `chantier` et `equipe` attendus par l'interface.
La modification conserve l'employé et le mois du bulletin : ces deux champs ne figurent pas dans
son corps de requête.

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

Pour l'export, la parité Spring est le comportement par défaut. Une étape optionnelle permet de
regrouper plusieurs équipes sous un libellé unique (par exemple `CH+OP` pour `CH` et `OP`). Ce
regroupement ne modifie aucune donnée : il agrège uniquement les lignes, totaux et analyses de
l'export, partout où l'équipe apparaît.

Un prototype PDF FastAPI utilise WeasyPrint 70.0 avec les ressources visuelles Spring embarquées
(CSS, logo et polices). `POST /paie/report/pdf` répond temporairement `503` : le prototype ne couvre
pas encore les pages, graphiques, comparaisons et sections du rapport Spring. La route ne sera
ouverte qu'après portage complet et comparaison sur un même jeu de données.

Les montants nuls sont acceptés. Un `salaireMensuel` nul n'est toutefois jamais silencieux :
l'assistant bloque la poursuite et exige l'action explicite « Ignorer et conserver 0 ». Une erreur de montant doit toujours nommer la ligne Excel, le
champ exact (`salaireMensuel`, `primeRoulageOrdinaire`, `primeRoulageDimanche` ou `salaireTotal`),
la valeur reçue et la contrainte violée; le message global « salaires et primes » est interdit.

Le modèle Excel attendu conserve l'ordre Spring (trois lignes d'en-tête) : `Nom & prénom`, `Fonction`,
`CIN`, `Nbre Jrs`, `J.R.O`, `J.R.D`, `Salaire`, `Prime RO`, `Prime RD`, `Total`, `Observation`,
`Chantier`, `Équipe`.
