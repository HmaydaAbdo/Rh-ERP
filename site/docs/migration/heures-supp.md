---
sidebar_position: 14
---

# Migration du domaine heures supplémentaires (lot 1 : lignes)

Le domaine `heuresupp` est porté dans l'application FastAPI (`api/src/staport/domains/heuresupp/`). Ce premier lot
couvre les lignes et leur analytique ; l'import Excel et l'export PDF suivent dans deux lots distincts (KAN-227).

| Route | Permissions (cumulatives) |
| --- | --- |
| `POST /heures-supp/search`, `GET /heures-supp/periodes`, `GET /heures-supp/{id}`, `POST /heures-supp/analytique` | `HEURES_SUP_READ` + `PAIE_READ` |
| `PUT /heures-supp/{id}` | `HEURES_SUP_IMPORT` + `PAIE_READ` |
| `POST /heures-supp` | `HEURES_SUP_IMPORT` + `PAIE_READ` + `EMPLOYEE_READ` + `CHANTIER_READ` |
| `DELETE /heures-supp/{id}` | `HEURES_SUP_DELETE` + `PAIE_READ` |
| `POST /heures-supp/suppression-mois` | `HEURES_SUP_PURGE` + `PAIE_READ` |

Règles reprises à l'identique : S/H = salaire journalier / 10 ou salaire mensuel / 260 arrondi à l'entier (HALF_DOWN,
un demi descend), montant = S/H × P/H arrondi de même, STC = montant pour un bulletin du mois marqué exactement
« STC » ou « sortie », net = montant − STC + forfait. Les refus de saisie sont des 400 (y compris « ligne
introuvable » et version périmée, comme `HeuresSuppImportException`) ; le décompte périmé d'une suppression de mois
est un 409. Les quatre écritures sont auditées (`HEURES_SUP_CREATION_UNITAIRE`, `_MODIFICATION`, `_SUPPRESSION`,
`_SUPPRESSION_MOIS`) avec l'historique `heures_supp_aud`.

Liens avec la paie (parité de `EcouteurPaieHeuresSupp`, dans la même transaction) : modifier l'observation d'un
bulletin recalcule STC et net des lignes liées et annule leur forfait en STC/sortie ; supprimer un bulletin (seul ou
en groupe) lié à des lignes est refusé en 409 avec les messages de Spring.

Écarts connus : le salaire ou son type absent d'une fiche employé donne un 400 explicite (Spring répondait 500) ;
une propriété de tri inconnue donne un 400 (Spring 500) ; la colonne de version d'une ligne neuve vaut 1 comme dans
tous les domaines Python.

Preuves : `api/tests/test_heuresupp.py` (PostgreSQL réel : calcul, créations et refus, STC, modification, recherche,
analytique, suppressions, écouteurs de la paie, audit et historique), matrices `test_audit.py` et `test_auth_acces.py`,
test de dérive des modèles.
