---
title: Domaine parametre
sidebar_position: 6
---

# Domaine `parametre` en Python (KAN-215)

Code : `api/src/staport/domains/parametre/`. Tests : `api/tests/test_parametre.py` (PostgreSQL réel, schéma construit par
Alembic). Le domaine remplace `ParametreService`, `CleParametre` et `ParametreController` de Spring, ainsi que le lecteur
provisoire `ParametresSecuriteSql` que le domaine `auth` utilisait en attendant. Il n'est pas encore branché en production :
la bascule se fait à la fin d'E2 (KAN-50), conformément à la [stratégie](strategie.md). Le comportement fonctionnel (valeurs,
bornes, écran) reste décrit dans `docs/parametre/README.md`.

## Organisation

| Module | Rôle |
|---|---|
| `catalogue.py` | Les 6 définitions (clé, libellé, description, type, unité, bornes) et leur validation : remplace l'enum `CleParametre` |
| `models.py` | Table `parametre` (clé unique, valeur texte, version optimiste) |
| `audit.py` | Table `parametre_aud` et champs audités (`cle`, `valeur`), noms identiques à Spring |
| `service.py` | `ServiceParametre` : liste, modification, et lecteurs typés (durées, longueur, pas de tranche, cron) |
| `router.py`, `schemas.py` | `GET /parametres` (`PARAMETRE_READ`), `PUT /parametres/{id}` (`PARAMETRE_WRITE`) |
| `exceptions.py` | 404 paramètre introuvable, 400 valeur invalide, erreur d'installation incomplète (500) |

Le domaine `auth` ne connaît que le port `ParametresSecurite` (`auth/parametres.py`) ; `ServiceParametre` le satisfait et
`creer_contexte` le lui fournit. L'ancien lecteur SQL et ses valeurs de repli sont supprimés.

## Écarts avec Spring

| Point | Spring | Python | Pourquoi |
|---|---|---|---|
| Valeurs en mémoire | Cache invalidé après commit, une seule instance | Aucune : chaque lecture interroge la base | Plusieurs processus possibles ; une modification s'applique partout sans invalidation distante. Coût : une lecture indexée par appel |
| Expression cron | Validée par `CronExpression` de Spring | Validée par APScheduler 3.11 (`CronTrigger`), six champs dans l'ordre de Spring | Bibliothèque officielle, réutilisable par la planification de la synchronisation des chantiers (KAN-49) |
| Jour de semaine du cron | `0` ou `7` = dimanche, noms acceptés | **Noms seulement** (`MON` à `SUN`, listes et plages) ou `*` ; un chiffre est refusé | APScheduler 3 compte `0` = lundi : un chiffre serait lu différemment selon le moteur. Décision du propriétaire (2026-11-04) |
| Caractère `?` du cron | Accepté | Refusé : écrire `*` | Non reconnu par APScheduler |
| Clé du catalogue sans ligne en base | Erreur d'installation incomplète | Idem (500), aucune valeur de repli | Parité ; l'ancien lecteur Python retombait sur des valeurs par défaut |
| Entier hors de la plage des `long` | « un nombre entier est attendu » | Idem | Parité avec `Long.parseLong` |

Un cron déjà enregistré par Spring avec un jour de semaine numérique reste lisible en base mais ne pourra plus être
ré-enregistré tel quel depuis l'écran. La valeur de départ (`0 0 23 * * *`) n'est pas concernée.

## Parité vérifiée

| Test Java | Équivalent Python |
|---|---|
| `CleParametreTest` (5) | `test_parametre.py` : codes uniques et retrouvables, entier canonique, refus hors bornes ou non entier (y compris `1e2`, `0x10`, chiffres non latins, dépassement de `long`), minimum 8 pour le mot de passe, cron accepté ou refusé |
| `ParametreServiceTest` (5) | `test_parametre.py` : valeurs de départ de chaque clé et lecteurs typés, modification lue aussitôt avec entrée d'audit et ligne `parametre_aud`, refus sans rien changer, paramètre inconnu en 404, cron invalide |
| `AuditArchitectureTest` | `test_audit.py` : la route `PUT /parametres/{identifiant}` est déclarée avec l'action `PARAMETRE_MODIFICATION` |
| Droits `PARAMETRE_READ` / `PARAMETRE_WRITE` | `test_parametre.py` : 403 sans la permission, 401 sans jeton |
| Verrou optimiste | `test_parametre.py` : version périmée en 409, requête incomplète en 400 |

Ajouts propres à Python : la valeur modifiée est bien celle que lit l'authentification (`/auth/password-policy`), et une clé
absente de la base lève l'erreur d'installation incomplète.

## Comparaison des lignes d'audit Spring / FastAPI (exécutée le 2026-11-04)

Même scénario rejoué des deux côtés sur un PostgreSQL réel construit par le même schéma (Flyway V1 à V44 côté Spring,
Alembic `0001_base_v44` côté Python) : une modification réussie (`securite.jeton-session.heures` de 12 à 8, saisie ` 8 `)
puis une modification refusée (`securite.mot-de-passe.longueur-minimale` à 3). Côté Spring, un test d'intégration temporaire
appelle `ParametreService` (Hibernate Envers et aspect d'audit réels) ; côté Python, l'API HTTP. Onze lignes lues de chaque
côté (journal, révision, entités de la révision, `parametre_aud`, table `parametre`), comparées champ par champ hors
valeurs propres à l'exécution (identifiants, horodatages, chaîne de hachage, identifiant de requête, adresse, acteur).

| Table | Résultat |
|---|---|
| `audit_journal` (succès) | Identique : `OPERATION`, `PARAMETRE_MODIFICATION`, `UPDATE`, `SUCCES`, entité `Parametre` et son identifiant, origine `API`, lien vers sa révision |
| `audit_revision` | Identique (origine `API`) |
| `audit_revision_entite` | Identique : `staport.rh.parametre.entities.Parametre` |
| `parametre_aud` | Identique : même `id`, même `revtype` 1, mêmes `cle` et `valeur` (`8`, espaces retirés) |
| `audit_journal` (refus) | Identique sauf le motif, ci-dessous : `ECHEC`, aucune révision, aucune ligne `parametre_aud` |
| `parametre` | Identique : valeurs et versions (1 pour la clé modifiée, 0 pour les autres) |

**Seule différence : le motif d'un échec.** Il reprend le nom de la classe d'exception : `ParametreInvalideException` côté
Spring, `ParametreInvalide` côté Python. Les exceptions Python portent des noms français propres au domaine, donc ce motif
diffère pour toute opération rejetée, dans tous les domaines. Les entrées déjà écrites par Spring ne sont pas modifiées ; la
liste des motifs d'échec à rapprocher se décide à la bascule (KAN-50) si un écran ou un rapport filtre sur ce champ.

## Ce qui n'est pas encore prouvé

- **Planification effective du cron** : ce domaine ne fait que le valider et le stocker. Son exécution arrive avec le
  domaine `chantier` (KAN-49).
- **Écran Paramètres du frontend** : inchangé, il parle à l'API avec les mêmes chemins et champs ; vérifié à la bascule.
