# RBAC — Chantier

> Trace exhaustive des accès du module Chantier. Toute évolution des autorisations de ce module
> met à jour ce fichier dans le même changement (conventions/security.md).

## Endpoints backend

| Endpoint | Permission (`@PreAuthorize`) |
|---|---|
| `POST /chantiers` | `CHANTIER_WRITE` |
| `PUT /chantiers/{id}` | `CHANTIER_WRITE` |
| `GET /chantiers/{id}` | `CHANTIER_READ` |
| `POST /chantiers/search` | `CHANTIER_READ` |
| `DELETE /chantiers/{id}` | `CHANTIER_DELETE` |
| `POST /chantiers/sync` | `CHANTIER_SYNC` |

## Frontend

| Élément | Condition |
|---|---|
| Lien sidebar « Chantiers » | `CHANTIER_READ` (`NAV_ITEMS`, `core/navigation/nav-items.ts`) |
| Routes `/chantiers` et `/chantiers/:id` | `authGuard` + `permissionGuard` (`CHANTIER_READ`) |
| Routes `/chantiers/new` et `/chantiers/:id/edit` | `authGuard` + `permissionGuard` (`CHANTIER_WRITE`) |
| Boutons « Nouveau chantier » et « Modifier » (liste, détail) | `CHANTIER_WRITE` — `canWrite()` |
| Bouton « Synchroniser maintenant » | `CHANTIER_SYNC` — `ChantierListComponent.canSync()` |
| Bouton « Supprimer » (liste) | `CHANTIER_DELETE` — `canDelete()` |

## Note — synchronisation automatique

La synchronisation **planifiée** (23 h chaque jour) s'exécute côté serveur, sans utilisateur : elle n'est soumise
à aucune permission. Seul le déclenchement **manuel** (`POST /chantiers/sync`) exige `CHANTIER_SYNC`.

## Rôles disposant de ces permissions (seed initial)

`SYSTEM_ADMIN` et `PAIE_MANAGER` ont les quatre permissions (voir
`V4__seed_permissions_et_roles.sql`) — administrable ensuite via `/admin/roles`.
