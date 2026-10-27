# RBAC — Chantier

> Trace exhaustive des accès du module Chantier. Toute évolution des autorisations de ce module
> met à jour ce fichier dans le même changement (conventions/security.md).

## Endpoints backend

| Endpoint | Permission (`@PreAuthorize`) |
|---|---|
| `POST /chantiers` | `CHANTIER_WRITE` |
| `PUT /chantiers/{id}` | `CHANTIER_WRITE` |
| `PUT /chantiers/{id}/statut` | `CHANTIER_WRITE` |
| `GET /chantiers/carte` | `CARTE_READ` (projection cartographique uniquement) |
| `GET /chantiers/{id}` | `CHANTIER_READ` |
| `POST /chantiers/search` | `CHANTIER_READ` |
| `DELETE /chantiers/{id}` | `CHANTIER_DELETE` |
| `POST /chantiers/sync` | `CHANTIER_SYNC` |

## Frontend

| Élément | Condition |
|---|---|
| Lien sidebar « Chantiers » | `CHANTIER_READ` (`NAV_ITEMS`, `core/navigation/nav-items.ts`) |
| Routes `/chantiers`, `/chantiers/cartes`, `/chantiers/analytique` et `/chantiers/:id` | `authGuard` + `permissionGuard` (`CHANTIER_READ`) |
| Routes `/chantiers/new` et `/chantiers/:id/edit` | `authGuard` + `permissionGuard` (`CHANTIER_WRITE`) |
| Bouton « Nouveau chantier » (en-tête commun aux trois vues) et « Modifier » (liste, détail) | `CHANTIER_WRITE` — `canWrite()` |
| Boutons « Clôturer » / « Rouvrir » (liste, détail) | `CHANTIER_WRITE` — `canWrite()` ; mise à jour par `PUT /chantiers/{id}/statut` |
| Bouton « Synchroniser maintenant » (en-tête commun aux trois vues) | `CHANTIER_SYNC` — `ChantierActionsComponent.canSync()` |
| Bouton « Supprimer » (liste) | `CHANTIER_DELETE` — `canDelete()` |
| Icône d'accès à la liste Employé depuis Cartes | Visible uniquement avec `EMPLOYEE_READ` ; les fiches Employé ne contribuent pas aux chiffres de Cartes et Analytique |
| Indicateurs du dernier mois Paie, historique mensuel et qualité des rattachements dans Cartes et Analytique | Appel au service Paie uniquement avec `PAIE_READ` |
| Filtres Fonction et Équipe de l’Analytique | `FUNCTION_READ` et `EQUIPE_READ` respectivement; sans le droit, le sélecteur et ses appels sont absents |
| Filtres de la qualité des rattachements | `CHANTIER_READ` pour Chantier et `FUNCTION_READ` pour Fonction |

## Note — synchronisation automatique

La synchronisation **planifiée** (23 h chaque jour) s'exécute côté serveur, sans utilisateur : elle n'est soumise
à aucune permission. Seul le déclenchement **manuel** (`POST /chantiers/sync`) exige `CHANTIER_SYNC`.

## Rôles disposant de ces permissions (seed initial)

`SYSTEM_ADMIN` et `PAIE_MANAGER` ont les quatre permissions (voir
`V4__seed_permissions_et_roles.sql`) — administrable ensuite via `/admin/roles`.
