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
| Lien sidebar « Paie » | `PAIE_READ` |
| Routes `/paie` et `/paie/:id` | `authGuard` + `permissionGuard` (`PAIE_READ`) |
| Routes `/paie/new` et `/paie/:id/edit` | `authGuard` + `permissionGuard` (`PAIE_WRITE`) |
| Boutons « Nouveau bulletin » et « Modifier » (liste, détail) | `PAIE_WRITE` — `canWrite()` |
| Boutons « Importer » / « Modèle Excel » | `PAIE_IMPORT` — `canImport()` |
| Bouton « Exporter » (Excel et PDF, dialog d'export) | `PAIE_EXPORT` — `canExport()` |
| Bouton « Supprimer » (liste) | `PAIE_DELETE` — `canDelete()` |

## Rôles disposant de ces permissions (seed initial)

`SYSTEM_ADMIN` et `PAIE_MANAGER` ont les cinq permissions (voir
`V4__seed_permissions_et_roles.sql`) — administrable ensuite via `/admin/roles`.
