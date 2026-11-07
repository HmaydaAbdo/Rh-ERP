---
sidebar_position: 14
---

# Migration du domaine heures supplémentaires (lots 1 et 2 : lignes et import)

Le domaine `heuresupp` est porté dans l'application FastAPI (`api/src/staport/domains/heuresupp/`). Les deux premiers
lots couvrent les lignes, leur analytique et l'assistant d'import Excel ; l'export PDF suit dans un troisième lot (KAN-227).

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

## Assistant d'import (lot 2)

Six routes sous `/heures-supp/import`, toutes avec `HEURES_SUP_IMPORT` + `PAIE_READ` : `GET /prerequis` (+ `CHANTIER_READ`),
`POST /analyse` et `POST /` et `POST /remplacement` (+ `EMPLOYEE_READ`), `POST /corrections` (+ `EMPLOYEE_WRITE` et
`FUNCTION_READ`), `GET /modele`. Le mois (`periode=AAAA-MM`) et le chantier (`chantierId`) sont des paramètres d'URL ; le
fichier est la partie `file`. Les parties `forfaits` et `corrections` sont du JSON envoyé en texte (comme l'import de la paie).
Les écrans Angular envoyaient ces deux parties en blob JSON : ils envoient désormais du texte, ce que FastAPI lit comme un
champ de formulaire.

Règles reprises à l'identique : lecture de la première feuille (trois colonnes exactement, en-têtes acceptés comme sous
Spring, lignes vides ignorées, CIN en doublon refusé, HS positif avec au plus une décimale), analyse sans écriture, import
atomique par mois et chantier (une ligne bloquante refuse tout), remplacement explicite des lignes existantes, forfaits
saisis à part par CIN (un seul par CIN, entier, interdit en STC/sortie), corrections explicites (alignement du nom sur le
fichier, création de fiches inconnues sur le chantier choisi). Journal : `HEURES_SUP_IMPORT` (création),
`HEURES_SUP_REMPLACEMENT` (modification) et `HEURES_SUP_IMPORT_CORRECTION` (employé), avec l'empreinte du fichier.

Écart connu : le remplacement supprime les anciennes lignes puis insère les nouvelles dans l'ordre (Spring dépendait de
l'ordre de vidage d'Hibernate).

Preuves : `api/tests/test_heuresupp_import.py` (PostgreSQL réel : prérequis, analyse, écarts, import, doublon, remplacement,
forfait seul, fichiers invalides, en-têtes variantes, corrections, modèle), matrices d'audit et d'accès (95 routes) et les
tests Angular du service d'import.
