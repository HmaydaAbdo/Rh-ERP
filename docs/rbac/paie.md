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
| `POST /paie/options/chantiers` | `PAIE_READ` |
| `POST /paie/options/equipes` | `PAIE_READ` |
| `DELETE /paie/{id}` | `PAIE_DELETE` |
| `POST /paie/suppression` | `PAIE_PURGE` (un mois, un chantier ou une équipe d'un coup : permission distincte de `PAIE_DELETE`) |
| `POST /paie/restauration/{idEntreeAudit}` | `PAIE_RESTORE` (restauration atomique depuis une suppression de groupe auditée) |
| `POST /paie/import` | `PAIE_IMPORT` |
| `GET /paie/import/modele` | `PAIE_IMPORT` |
| `GET /paie/periodes` | `PAIE_READ` |
| `POST /paie/analytique` | `PAIE_READ` |
| `POST /paie/periodes/search` | `PAIE_READ` |
| `POST /paie/chantiers/search` | `PAIE_READ` |
| `GET /paie/chantiers` | `PAIE_READ` |
| `GET /paie/materiel` | `PAIE_READ` |
| `POST /paie/export` | `PAIE_EXPORT` |
| `POST /paie/report/pdf` | `PAIE_EXPORT` |

> Les sélecteurs des écrans Paie appellent aussi les domaines voisins : `/functions/search` (`FUNCTION_READ`),
> `/chantiers/search` (`CHANTIER_READ`), `/equipes/search` (`EQUIPE_READ`) et `/employees/search`
> (`EMPLOYEE_READ`). Un rôle qui saisit des bulletins doit porter ces permissions de lecture — voir
> [README.md](README.md), « Dépendances entre permissions ». **Dans la barre de filtres**, un sélecteur dont la permission
> manque n'est pas proposé (`PaieFiltresComponent`) : l'appeler provoquerait un `403`, journalisé comme un faux refus.
> Quand un mois est choisi, les menus Chantier et Équipe utilisent les endpoints Paie paginés ci-dessus (`PAIE_READ`) pour
> respecter le périmètre des bulletins de ce mois et les chantiers choisis ; sans mois, ils interrogent les référentiels voisins.

## Frontend

| Élément | Condition |
|---|---|
| Lien sidebar « Paie » | `PAIE_READ` (`NAV_ITEMS`, `core/navigation/nav-items.ts`) |
| Routes `/paie`, `/paie/cartes`, `/paie/analytique` et `/paie/:id` | `authGuard` + `permissionGuard` (`PAIE_READ`) — les trois vues partagent la barre de filtres (sélecteurs visibles selon `CHANTIER_READ`, `FUNCTION_READ`, `EQUIPE_READ`) ; pour un mois choisi, les menus Chantiers/Équipes paginent via `/paie/options/chantiers` et `/paie/options/equipes` (`PAIE_READ`), et leurs options sont cherchées dans le périmètre mois/chantier ; sans mois ils utilisent les référentiels voisins. La vue Cartes appelle également `/paie/periodes/search` et `/paie/chantiers/search`, Analytique `/paie/analytique`, et la barre `/paie/periodes` pour griser les mois sans paie |
| Routes `/paie/new` et `/paie/:id/edit` | `authGuard` + `permissionGuard` (`PAIE_WRITE`) |
| Boutons « Nouveau bulletin » et « Modifier » (liste, détail) | `PAIE_WRITE` — `canWrite()` |
| Boutons « Importer » / « Modèle Excel » | `PAIE_IMPORT` — `canImport()` |
| Bouton « Exporter » (assistant d'export, Excel et PDF) | `PAIE_EXPORT` — `canExport()` ; l'assistant lit aussi `/paie/periodes`, `/paie/chantiers` et `/paie/materiel` (`PAIE_READ`) |
| Bouton « Supprimer » (liste) | `PAIE_DELETE` — `canDelete()` |
| Boutons de suppression en groupe (cartes de mois et de chantier, lignes d'équipe, « Supprimer ce chantier » de la vue Cartes) | `PAIE_PURGE` — `canPurge()` |
| Action « Restaurer ce groupe » dans le détail d'une suppression de groupe du journal d'audit | `PAIE_RESTORE` — distincte de `AUDIT_READ` |
| Bouton « Historique » (détail d'un bulletin) | `AUDIT_READ` — `canViewHistory()` |
| Colonnes Chantiers / Équipes / Fonctions du panneau de filtres | `CHANTIER_READ` / `EQUIPE_READ` / `FUNCTION_READ` |

## Rôles disposant de ces permissions (seed initial)

`SYSTEM_ADMIN` et `PAIE_MANAGER` ont les cinq permissions d'origine (voir
`V4__seed_permissions_et_roles.sql`) **et `PAIE_PURGE`** (`V15__permission_paie_purge.sql`, attribuée à `SYSTEM_ADMIN` et à
chaque rôle qui détenait `PAIE_DELETE`, pour ne rien retirer aux comptes existants). Pour séparer les pouvoirs, retirer
`PAIE_PURGE` des rôles qui ne doivent supprimer qu'un bulletin à la fois — administrable via `/admin/roles`.
`PAIE_RESTORE` est attribuée à `SYSTEM_ADMIN` seul par `V17__permission_paie_restore.sql` ; elle peut ensuite être accordée
depuis `/admin/roles`. `AUDIT_READ` ne donne jamais le droit de restaurer.
