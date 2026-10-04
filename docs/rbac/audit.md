# RBAC — Audit

> Trace exhaustive des accès du module Audit. Toute évolution des autorisations de ce module met à jour ce fichier dans le
> même changement (conventions/security.md).

L'audit contient des données personnelles (noms, CIN, adresses IP) et des montants : sa lecture exige **une permission
dédiée**, `AUDIT_READ` (migration `V12`), attribuée à `SYSTEM_ADMIN` seulement à l'installation (décision RH du 2026-10-04) puis
administrable depuis l'écran Rôles. **Aucune route ne modifie ni ne supprime le journal** : il n'existe pas de permission
d'écriture sur l'audit.

## Endpoints backend

| Endpoint | Permission (`@PreAuthorize`) |
|---|---|
| `POST /logs/search` | `AUDIT_READ` |
| `GET /logs/{id}` | `AUDIT_READ` |
| `GET /logs/{id}/details` | `AUDIT_READ` |
| `GET /logs/historique/{entite}/{id}` | `AUDIT_READ` |

La pagination est bornée (200 par page, `spring.data.web.pageable.max-page-size`).

## Frontend

| Élément | Condition |
|---|---|
| Lien sidebar « Journal » | `AUDIT_READ` (`NAV_ITEMS`) |
| Route `/audit` | `authGuard` + `permissionGuard` (`AUDIT_READ`) |
| Bouton « Historique » du détail d'un bulletin et d'un employé | `AUDIT_READ` — `canViewHistory()` |

## Rôles disposant de cette permission (seed initial)

`SYSTEM_ADMIN` seulement (`V12__seed_audit_permission.sql`). `PAIE_MANAGER` ne l'a pas : la direction de la paie ne lit pas
l'audit sans décision explicite.
