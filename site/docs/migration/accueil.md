---
sidebar_position: 13
---

# Migration du domaine accueil

Le domaine `accueil` est porté dans l'application FastAPI unique (`api/src/staport/domains/accueil/`). Les six routes
de Spring sont conservées avec leurs permissions : `GET`, `PUT` et `DELETE /accueil` (`ACCUEIL_READ`, `ACCUEIL_WRITE`,
`ACCUEIL_WRITE`) et les mêmes verbes sur `/accueil/utilisateurs/{id}` (`ACCUEIL_ADMIN`). La table `accueil_preference`
vient de Flyway V42 ; le modèle SQLAlchemy est comparé à la base migrée par le test de dérive existant.

Règles reprises à l'identique : catalogue fixe de neuf indicateurs, chacun protégé par la permission de lecture de son
domaine (`PAIE_READ`, `EMPLOYEE_READ`) ; sans choix enregistré, tout ce qui est autorisé dans l'ordre du catalogue ; un
choix que la perte de droits a vidé retombe sur tout l'autorisé, alors qu'un choix vidé volontairement reste vide ;
refus 400 d'un indicateur inconnu, non autorisé (pour la cible, pas pour l'administrateur) ou en double ; version
optimiste (409, y compris un premier enregistrement qui annonce une version) ; réinitialisation idempotente. Les écritures
sont auditées (`ACCUEIL_MODIFICATION` en UPDATE, `ACCUEIL_REINITIALISATION` en DELETE) avec l'historique
`accueil_preference_aud`.

Écart connu, commun à tous les domaines Python : la colonne de version d'une ligne neuve vaut 1 (générateur par défaut
de SQLAlchemy) et non 0 comme sous Hibernate. Angular traite la version comme une valeur opaque (`null` tant que rien
n'est enregistré), donc aucun parcours ne change.

Preuves : `api/tests/test_accueil.py` (11 tests sur PostgreSQL réel : lecture, droits, ordre, version, validations,
choix vide, perte de droits, réinitialisation, administration d'un autre compte, 404, permissions, audit et historique),
matrices `test_audit.py` et `test_auth_acces.py`, et les 3 fichiers de tests Angular de l'accueil.
