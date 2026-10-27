# RBAC — Carte des chantiers

> Trace exhaustive des accès de la carte des chantiers. Toute évolution des autorisations de ce module
> met à jour ce fichier dans le même changement (conventions/security.md).

## Permission

| Permission | Action autorisée | Migration |
|---|---|---|
| `CARTE_READ` | Consulter la carte des chantiers | V28 |

La carte a sa propre permission, distincte de `CHANTIER_READ` (qui donne accès au référentiel des chantiers) : un rôle
peut voir la carte sans pouvoir consulter ni modifier le référentiel, et inversement.

## Endpoints backend

| Endpoint | Permission | Contenu |
|---|---|---|
| `GET /chantiers/carte` | `CARTE_READ` | Identité, nature et position des seuls chantiers autorisés à l'affichage ; sans paie |

La gestion des champs reste sous `CHANTIER_WRITE`. Voir le [contrat du domaine](../chantier/README.md#api) et `EndpointSecurityTest`.

## Frontend

| Élément | Condition |
|---|---|
| Entrée de menu « Carte » | `CARTE_READ` (`NAV_ITEMS`, `core/navigation/nav-items.ts`) |
| Route de la carte | `authGuard` + `permissionGuard` (`CARTE_READ`) |

## Rôles disposant de cette permission (seed initial)

Décision (HMAYDA, 2026-10-18) :

| Rôle | `CARTE_READ` |
|---|---|
| `SYSTEM_ADMIN` | Oui (il porte toutes les permissions) |
| `DIRECTION` | Oui — rôle créé par `V28` pour le Président et les directeurs ; **ne porte que cette permission** à l'installation |
| `PAIE_MANAGER` | **Non** |

Les autres attributions se font ensuite depuis l'écran **Rôles** (`/admin/roles`). Par exemple, pour que la direction puisse
ouvrir la fiche d'un chantier depuis la carte, lui ajouter `CHANTIER_READ`.

Si un rôle nommé `DIRECTION` existe déjà au moment de la migration (créé depuis l'écran Rôles), il est conservé tel quel
et reçoit seulement `CARTE_READ` : la migration ne doit jamais empêcher le démarrage de l'application.
