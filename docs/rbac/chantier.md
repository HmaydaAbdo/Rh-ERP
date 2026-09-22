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
| Lien sidebar "Chantiers" | Aucune (visible dès qu'authentifié — la page elle-même échoue proprement en 403 si `CHANTIER_READ` manque) |
| Route `/chantiers/**` | `authGuard` (authentification seule, pas de permission spécifique au niveau route) |
| Bouton "Supprimer" (liste) | `authService.hasPermission('CHANTIER_DELETE')` — voir `ChantierListComponent.canDelete()` |
| Bouton "Synchroniser maintenant" | Aucune vérification frontend dédiée — repose sur le 403 backend si `CHANTIER_SYNC` manque (amélioration possible : gater aussi côté UI) |

## Rôles disposant de ces permissions (seed initial)

`SYSTEM_ADMIN` et `PAIE_MANAGER` ont les quatre permissions (voir
`V4__seed_permissions_et_roles.sql`) — administrable ensuite via `/admin/roles`.
