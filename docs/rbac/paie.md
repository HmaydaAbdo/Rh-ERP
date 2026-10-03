# RBAC — Paie

> Trace exhaustive des accès du module Paie. Toute évolution des autorisations de ce module
> met à jour ce fichier dans le même changement (conventions/security.md).

## Endpoints backend

| Endpoint | Permission (`@PreAuthorize`) |
|---|---|
| `POST /paie` | `PAIE_WRITE` |
| `PUT /paie/{id}` | `PAIE_WRITE` |
| `GET /paie/{id}` | `PAIE_READ` |
| `POST /paie/search` | `PAIE_READ` |
| `DELETE /paie/{id}` | `PAIE_DELETE` |
| `POST /paie/import` | `PAIE_IMPORT` |
| `GET /paie/import/modele` | `PAIE_IMPORT` |
| `GET /paie/equipes` | `PAIE_READ` |

> Le sélecteur d'équipe des écrans Paie appelle aussi `/equipes/search` (`EQUIPE_READ`, voir `docs/rbac/equipe.md`).
| `POST /paie/export` | `PAIE_EXPORT` |
| `POST /paie/report/pdf` | `PAIE_EXPORT` |

## Frontend

| Élément | Condition |
|---|---|
| Lien sidebar "Paie" | Aucune (visible dès qu'authentifié) |
| Route `/paie/**` | `authGuard` (authentification seule) |
| Bouton "Supprimer" (liste) | `authService.hasPermission('PAIE_DELETE')` — voir `PaieListComponent.canDelete()` |
| Boutons "Importer" / "Modèle Excel" / "Exporter Excel" / "Exporter PDF" | Aucune vérification frontend dédiée — repose sur le 403 backend si la permission manque |

## Rôles disposant de ces permissions (seed initial)

`SYSTEM_ADMIN` et `PAIE_MANAGER` ont les cinq permissions (voir
`V4__seed_permissions_et_roles.sql`) — administrable ensuite via `/admin/roles`.
