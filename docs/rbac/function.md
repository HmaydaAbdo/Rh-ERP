# RBAC — Function

> Trace exhaustive des accès du module Function. Toute évolution des autorisations de ce module
> met à jour ce fichier dans le même changement (conventions/security.md).

## Endpoints backend

| Endpoint | Permission (`@PreAuthorize`) |
|---|---|
| `POST /functions` | `FUNCTION_WRITE` |
| `PUT /functions/{id}` | `FUNCTION_WRITE` |
| `GET /functions/{id}` | `FUNCTION_READ` |
| `POST /functions/search` | `FUNCTION_READ` |
| `DELETE /functions/{id}` | `FUNCTION_DELETE` |
| `POST /functions/import` | `FUNCTION_IMPORT` |
| `GET /functions/import/modele` | `FUNCTION_IMPORT` |

## Frontend

| Élément | Condition |
|---|---|
| Lien sidebar « Fonctions » | `FUNCTION_READ` (`NAV_ITEMS`) |
| Routes `/functions`, `/functions/cartes`, `/functions/analytique` et `/functions/:id` | `authGuard` + `permissionGuard` (`FUNCTION_READ`) |
| Routes `/functions/new` et `/functions/:id/edit` | `authGuard` + `permissionGuard` (`FUNCTION_WRITE`) |
| Boutons « Nouvelle fonction » et « Modifier » (liste, détail) | `FUNCTION_WRITE` — `canWrite()` |
| Boutons « Importer » / « Modèle Excel » (en-tête commun aux trois vues) | `FUNCTION_IMPORT` — `canImport()` |
| Bouton « Supprimer » (liste) | `FUNCTION_DELETE` — `canDelete()` |
| Effectifs des fiches Employé dans Cartes et Analytique | Appel au service Employé uniquement avec `EMPLOYEE_READ` |
| Indicateurs et montants Paie dans Cartes et Analytique | Appel au service Paie uniquement avec `PAIE_READ` |

## Note — import automatique de fonctions depuis Paie

`PaieImportService` crée automatiquement des fonctions manquantes lors d'un import Paie (voir
`docs/paie/README.md`). Cette création interne n'est pas soumise à `FUNCTION_WRITE` (appel
service-à-service, pas un endpoint HTTP) — seul l'utilisateur qui déclenche l'import Paie a besoin
de `PAIE_IMPORT`.

## Rôles disposant de ces permissions (seed initial)

`SYSTEM_ADMIN` et `PAIE_MANAGER` ont les quatre permissions (voir
`V4__seed_permissions_et_roles.sql`) — administrable ensuite via `/admin/roles`.
