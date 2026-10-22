# RBAC — Équipe

> Trace exhaustive des accès du module Équipe. Toute évolution des autorisations de ce module
> met à jour ce fichier dans le même changement (conventions/security.md).

## Endpoints backend

| Endpoint | Permission (`@PreAuthorize`) |
|---|---|
| `POST /equipes` | `EQUIPE_WRITE` |
| `PUT /equipes/{id}` | `EQUIPE_WRITE` |
| `GET /equipes/{id}` | `EQUIPE_READ` |
| `POST /equipes/search` | `EQUIPE_READ` |
| `DELETE /equipes/{id}` | `EQUIPE_DELETE` |

## Frontend

| Élément | Condition |
|---|---|
| Lien sidebar « Équipes » | `EQUIPE_READ` (`NAV_ITEMS`, `core/navigation/nav-items.ts`) |
| Routes `/equipes`, `/equipes/cartes`, `/equipes/analytique` et `/equipes/:id` | `authGuard` + `permissionGuard` (`EQUIPE_READ`) |
| Route `/equipes/new` et `/equipes/:id/edit` | `authGuard` + `permissionGuard` (`EQUIPE_WRITE`) |
| Bouton « Nouvelle équipe » et « Modifier » (liste, détail) | `authService.hasPermission('EQUIPE_WRITE')` — `canWrite()` |
| Bouton « Supprimer » (liste) | `authService.hasPermission('EQUIPE_DELETE')` — `canDelete()` |
| Effectifs des fiches Employé dans Cartes et Analytique | Appel au service Employé uniquement avec `EMPLOYEE_READ` |
| Indicateurs et montants Paie dans Cartes et Analytique | Appel au service Paie uniquement avec `PAIE_READ` |

## Note — consommation depuis Paie

Le sélecteur d'équipe des écrans Paie (formulaire d'un bulletin, filtre de la liste) appelle
`POST /equipes/search` et `GET /equipes/{id}` : un utilisateur qui saisit des bulletins a donc besoin
de `EQUIPE_READ` en plus de `PAIE_WRITE`. L'import Excel de la paie résout les codes d'équipe
service-à-service (`IEquipeService`, pas un endpoint HTTP) : seul `PAIE_IMPORT` est requis.

## Rôles disposant de ces permissions (seed initial)

Les rôles qui portent `CHANTIER_READ`/`CHANTIER_WRITE`/`CHANTIER_DELETE` reçoivent
`EQUIPE_READ`/`EQUIPE_WRITE`/`EQUIPE_DELETE` (`V9__seed_equipe_permissions.sql`), soit `SYSTEM_ADMIN`
et `PAIE_MANAGER` — administrable ensuite via `/admin/roles`.
