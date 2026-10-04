# RBAC — Catalogue des permissions

> Qui a le droit de faire quoi. Ce fichier donne la vue d'ensemble (les 24 permissions, les rôles de départ,
> la matrice endpoint ↔ permission). Le détail par domaine, avec les guards et boutons du frontend, est dans
> un fichier dédié. Le fonctionnement du modèle (rôles, refus individuels, jetons) est dans
> [../auth/README.md](../auth/README.md), sa conception dans `conventions/security.md`.

| Domaine | Fichier détaillé |
|---|---|
| Fonction | [function.md](function.md) |
| Chantier | [chantier.md](chantier.md) |
| Équipe | [equipe.md](equipe.md) |
| Employé | [employee.md](employee.md) |
| Paie (et rapport) | [paie.md](paie.md) |
| Auth (comptes, rôles) | [auth.md](auth.md) |
| Audit (journal, historique) | [audit.md](audit.md) |

---

## Principes

- **Une permission = une action sur un domaine** : `DOMAINE_ACTION`. Le catalogue est **fixe** (créé par
  migration) ; seule l'attribution aux rôles est administrable.
- **Chaque endpoint** porte un `@PreAuthorize("hasAuthority('X')")` (sauf les endpoints publics d'`/auth`).
  Un endpoint sans permission explicite est un défaut : `EndpointSecurityTest` le détecte.
- **La suppression est une permission** (`*_DELETE`), jamais un rôle codé en dur.
- **Refus individuel > rôles** : une permission refusée à un utilisateur l'est quels que soient ses rôles.
- **Aucune règle ne s'appuie sur un nom de rôle**, sauf l'accès aux endpoints Actuator (`SYSTEM_ADMIN`) et la protection du
  rôle `SYSTEM_ADMIN` contre la suppression.
- **Chaque refus `403` est journalisé** (événement `ACCES_REFUSE`, voir [../audit/README.md](../audit/README.md)) : un écran ne
  doit jamais appeler une route que son utilisateur n'a pas le droit d'appeler.
- **Le frontend masque** ce que l'utilisateur ne peut pas faire (menu, routes, boutons), mais la sécurité réelle
  est celle du backend.
- Les permissions voyagent dans le jeton d'accès (15 minutes) : un changement de droits s'applique au prochain
  rafraîchissement de l'utilisateur concerné.

---

## Catalogue des 24 permissions

| Domaine | Permission | Action autorisée | Migration |
|---|---|---|---|
| Chantier | `CHANTIER_READ` | Consulter la liste et le détail | V4 |
| | `CHANTIER_WRITE` | Créer, modifier | V4 |
| | `CHANTIER_DELETE` | Supprimer | V4 |
| | `CHANTIER_SYNC` | Déclencher la synchronisation avec l'ERP | V4 |
| Employé | `EMPLOYEE_READ` | Consulter | V4 |
| | `EMPLOYEE_WRITE` | Créer, modifier | V4 |
| | `EMPLOYEE_DELETE` | Supprimer | V4 |
| | `EMPLOYEE_IMPORT` | Importer depuis Excel (et télécharger le modèle) | V4 |
| Fonction | `FUNCTION_READ` | Consulter | V4 |
| | `FUNCTION_WRITE` | Créer, modifier | V4 |
| | `FUNCTION_DELETE` | Supprimer | V4 |
| | `FUNCTION_IMPORT` | Importer depuis Excel (et télécharger le modèle) | V4 |
| Paie | `PAIE_READ` | Consulter les bulletins, lister les équipes d'un chantier | V4 |
| | `PAIE_WRITE` | Créer, modifier un bulletin | V4 |
| | `PAIE_DELETE` | Supprimer **un** bulletin | V4 |
| | `PAIE_PURGE` | Supprimer **en groupe** : un mois, un chantier ou une équipe d'un coup (séparation des pouvoirs : elle n'est pas contenue dans `PAIE_DELETE`) | V15 |
| | `PAIE_IMPORT` | Importer depuis Excel (et télécharger le modèle) | V4 |
| | `PAIE_EXPORT` | Exporter en Excel et générer le rapport PDF | V4 |
| Équipe | `EQUIPE_READ` | Consulter | V9 |
| | `EQUIPE_WRITE` | Créer, modifier | V9 |
| | `EQUIPE_DELETE` | Supprimer | V9 |
| Administration | `USER_MANAGE` | Gérer les comptes (création, rôles, refus individuels, mot de passe) | V4 |
| | `ROLE_MANAGE` | Gérer les rôles et consulter le catalogue des permissions | V4 |
| Audit | `AUDIT_READ` | Consulter le journal d'audit et l'historique des enregistrements (données personnelles et montants : réservée à l'administrateur à l'installation) | V12 |

### Dépendances entre permissions

Certains écrans appellent plusieurs domaines ; un rôle doit alors porter **toutes** les permissions concernées :

| Pour… | Il faut aussi… | Pourquoi |
|---|---|---|
| Saisir un bulletin (`PAIE_WRITE`) | `EMPLOYEE_READ`, `FUNCTION_READ`, `CHANTIER_READ`, `EQUIPE_READ` | Les sélecteurs du formulaire interrogent ces domaines |
| Filtrer la liste Paie par fonction, chantier ou équipe | `FUNCTION_READ`, `CHANTIER_READ`, `EQUIPE_READ` | Mêmes sélecteurs. **Sans l'une de ces permissions, le sélecteur correspondant n'est pas proposé** (un refus `403` serait un faux refus dans le journal d'audit) |
| Voir le bouton « Historique » d'un bulletin ou d'un employé | `AUDIT_READ` | Il appelle `/logs/historique/...` |
| Saisir un employé (`EMPLOYEE_WRITE`) | `FUNCTION_READ`, `CHANTIER_READ` | Sélecteurs fonction et chantier |
| Associer un employé à un compte (`USER_MANAGE`) | `EMPLOYEE_READ` | Sélecteur d'employé |
| Exporter (`PAIE_EXPORT`) | `PAIE_READ` | L'assistant d'export lit les mois, chantiers et tableaux matériel (`/paie/periodes`, `/paie/chantiers`, `/paie/materiel`) |
| Importer (Paie, Employé) | Aucune | Les référentiels sont résolus par le serveur (appels de service, pas HTTP) |

---

## Rôles de départ

| Rôle | Permissions |
|---|---|
| `SYSTEM_ADMIN` | Les 24 |
| `PAIE_MANAGER` | Les 21 permissions métier (tout sauf `USER_MANAGE`, `ROLE_MANAGE` et `AUDIT_READ`) |

D'autres rôles se créent depuis l'écran **Rôles** (`/admin/roles`), sans toucher au code.

---

## Matrice endpoint ↔ permission

Table de référence de `EndpointSecurityTest` (`PERMISSIONS_ATTENDUES`) : toute modification doit être répercutée
dans ce test, dans ce tableau et dans le fichier du domaine.

| Domaine | Méthode et route | Permission |
|---|---|---|
| Fonction | `POST /functions` · `PUT /functions/{id}` | `FUNCTION_WRITE` |
| | `GET /functions/{id}` · `POST /functions/search` | `FUNCTION_READ` |
| | `DELETE /functions/{id}` | `FUNCTION_DELETE` |
| | `POST /functions/import` · `GET /functions/import/modele` | `FUNCTION_IMPORT` |
| Chantier | `POST /chantiers` · `PUT /chantiers/{id}` | `CHANTIER_WRITE` |
| | `GET /chantiers/{id}` · `POST /chantiers/search` | `CHANTIER_READ` |
| | `DELETE /chantiers/{id}` | `CHANTIER_DELETE` |
| | `POST /chantiers/sync` | `CHANTIER_SYNC` |
| Équipe | `POST /equipes` · `PUT /equipes/{id}` | `EQUIPE_WRITE` |
| | `GET /equipes/{id}` · `POST /equipes/search` | `EQUIPE_READ` |
| | `DELETE /equipes/{id}` | `EQUIPE_DELETE` |
| Employé | `POST /employees` · `PUT /employees/{id}` | `EMPLOYEE_WRITE` |
| | `GET /employees/{id}` · `POST /employees/search` | `EMPLOYEE_READ` |
| | `DELETE /employees/{id}` | `EMPLOYEE_DELETE` |
| | `POST /employees/import` · `GET /employees/import/modele` | `EMPLOYEE_IMPORT` |
| Paie | `POST /paie` · `PUT /paie/{id}` | `PAIE_WRITE` |
| | `GET /paie/{id}` · `POST /paie/search` · `GET /paie/periodes` · `GET /paie/chantiers` · `GET /paie/materiel` | `PAIE_READ` |
| | `DELETE /paie/{id}` | `PAIE_DELETE` |
| | `POST /paie/suppression` (suppression en groupe) | `PAIE_PURGE` |
| | `POST /paie/import` · `GET /paie/import/modele` | `PAIE_IMPORT` |
| | `POST /paie/export` · `POST /paie/report/pdf` | `PAIE_EXPORT` |
| Utilisateurs | `GET /users`, `GET /users/{id}`, `POST /users`, `PUT /users/{id}`, `PUT /users/{id}/permissions-refusees`, `POST /users/{id}/reset-password` | `USER_MANAGE` |
| Rôles | `GET /roles`, `GET /roles/{id}`, `POST /roles`, `PUT /roles/{id}`, `DELETE /roles/{id}`, `GET /permissions` | `ROLE_MANAGE` |
| Audit | `POST /logs/search`, `GET /logs/{id}`, `GET /logs/{id}/details`, `GET /logs/historique/{entite}/{id}` | `AUDIT_READ` |
| Auth publique | `POST /auth/login`, `/auth/refresh`, `/auth/forgot-password`, `/auth/reset-password` | Aucune |
| Auth connecté | `GET /auth/me`, `POST /auth/logout` | Jeton valide |
| Supervision | `GET /actuator/health` | Aucune |
| | Swagger (`/swagger-ui/**`, `/v3/api-docs/**`) | Aucune **si la documentation est allumée** (développement) ; éteinte par défaut, ces routes exigent un jeton |
| | Autres endpoints Actuator | `SYSTEM_ADMIN` |

---

## Ajouter une permission ou un endpoint

1. **Migration Flyway** qui insère la permission (code, description) et l'attribue aux rôles concernés
   (voir `V9__seed_equipe_permissions.sql` pour un exemple).
2. `@PreAuthorize("hasAuthority('…')")` sur chaque méthode du contrôleur.
3. Ligne dans `PERMISSIONS_ATTENDUES` de `EndpointSecurityTest` (le test échoue sinon).
4. Côté frontend : `permissionGuard` sur les routes, `canXxx()` sur les boutons, entrée dans `NAV_ITEMS` si
   c'est un écran.
5. Mettre à jour le fichier du domaine, ce catalogue et la section « Dépendances entre permissions ».
