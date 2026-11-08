---
title: Inventaire de sortie
sidebar_position: 1
---

# Inventaire du backend Spring (KAN-45)

> Document **généré** par `scripts/migration/inventaire-backend.py` : ne pas l'éditer à la main, relancer le script.
> C'est la liste de contrôle de sortie de la migration (ADR 0016, § 7) : une ligne n'est cochée dans le suivi Jira
> qu'avec sa preuve de parité (test, comparaison OpenAPI, comparaison d'images pour les PDF).

## Totaux

- 430 fichiers Java, 25203 lignes ; 110 fichiers de test, 586 tests.
- 101 routes HTTP, 31 outils MCP, 73 actions d'audit distinctes, 1 tâches planifiées.
- 44 migrations Flyway (`V1__enable_extensions.sql` à `V44__heures_supp_montants_entiers.sql`), 7 fichiers de modèles de rapport, 35 clés de configuration lues dans `application.yml`.

## Par domaine

| Domaine | Fichiers | Lignes | Routes | Outils MCP | Actions d'audit | Entités | Tests |
|---|---:|---:|---:|---:|---:|---:|---:|
| (racine) | 1 | 31 | 0 | 0 | 0 | 0 | 1 |
| accueil | 11 | 472 | 6 | 0 | 2 | 1 | 6 |
| architecture | 0 | 0 | 0 | 0 | 0 | 0 | 15 |
| audit | 48 | 2798 | 4 | 0 | 0 | 2 | 95 |
| auth | 73 | 3399 | 21 | 0 | 6 | 5 | 113 |
| chantier | 29 | 1230 | 8 | 0 | 4 | 1 | 29 |
| common | 13 | 591 | 0 | 0 | 0 | 0 | 23 |
| employee | 37 | 1970 | 9 | 0 | 5 | 2 | 46 |
| equipe | 19 | 806 | 7 | 0 | 4 | 1 | 13 |
| function | 19 | 726 | 7 | 0 | 4 | 1 | 10 |
| heuresupp | 38 | 2347 | 14 | 0 | 8 | 1 | 56 |
| mcp | 15 | 1988 | 0 | 31 | 30 | 0 | 29 |
| paie | 114 | 8299 | 23 | 0 | 9 | 1 | 136 |
| parametre | 13 | 546 | 2 | 0 | 1 | 1 | 10 |
| referentiel | 0 | 0 | 0 | 0 | 0 | 0 | 4 |
| support | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## (racine)


## accueil

### Routes

| Verbe | Chemin | Permission | Source |
|---|---|---|---|
| DELETE | `/accueil` | ACCUEIL_WRITE | AccueilController.java |
| DELETE | `/accueil/utilisateurs/{id}` | ACCUEIL_ADMIN | AccueilController.java |
| GET | `/accueil` | ACCUEIL_READ | AccueilController.java |
| GET | `/accueil/utilisateurs/{id}` | ACCUEIL_ADMIN | AccueilController.java |
| PUT | `/accueil` | ACCUEIL_WRITE | AccueilController.java |
| PUT | `/accueil/utilisateurs/{id}` | ACCUEIL_ADMIN | AccueilController.java |

### Actions d'audit

- `ACCUEIL_MODIFICATION` (AccueilService.java)
- `ACCUEIL_REINITIALISATION` (AccueilService.java)

### Entités et tables

| Entité | Table | Historisée (`@Audited`) |
|---|---|---|
| PreferenceAccueil | `accueil_preference` | oui |

### Exceptions métier

`AccueilInvalideException`


## architecture


## audit

### Routes

| Verbe | Chemin | Permission | Source |
|---|---|---|---|
| GET | `/logs/historique/{entite}/{id}` | AUDIT_READ | AuditController.java |
| GET | `/logs/{id}` | AUDIT_READ | AuditController.java |
| GET | `/logs/{id}/details` | AUDIT_READ | AuditController.java |
| POST | `/logs/search` | AUDIT_READ | AuditController.java |

### Tâches planifiées

- `fixedDelayString = "${audit.integrite.chaine-delai-ms:86400000}"` (VerificationIntegriteAudit.java)

### Métriques

- `rh.audit.chaine.invalide`
- `rh.audit.ecriture.echec`
- `rh.audit.evenement.securite`
- `rh.audit.integrite.compromise`

### Entités et tables

| Entité | Table | Historisée (`@Audited`) |
|---|---|---|
| AuditJournalEntry | `audit_journal` | non |
| AuditRevision | `audit_revision` | non |

### Exceptions métier

`AuditEntryNotFoundException`, `AuditEntryNotRestaurableException`, `UnknownAuditEntityException`

### Clés de configuration lues

`audit.integrite.chaine-delai-ms`


## auth

### Routes

| Verbe | Chemin | Permission | Source |
|---|---|---|---|
| DELETE | `/roles/{id}` | ROLE_MANAGE | RoleController.java |
| GET | `/.well-known/jwks.json` | publique (SecurityConfig) | AuthController.java |
| GET | `/auth/me` | authentifiée (aucune permission) | AuthController.java |
| GET | `/auth/password-policy` | publique (SecurityConfig) | AuthController.java |
| GET | `/permissions` | ROLE_MANAGE, USER_MANAGE | RoleController.java |
| GET | `/roles/{id}` | ROLE_MANAGE, USER_MANAGE | RoleController.java |
| GET | `/users/{id}` | USER_MANAGE | UserController.java |
| POST | `/auth/forgot-password` | publique (SecurityConfig) | AuthController.java |
| POST | `/auth/jetons/agent` | IA_UTILISER | AgentController.java |
| POST | `/auth/login` | publique (SecurityConfig) | AuthController.java |
| POST | `/auth/logout` | authentifiée (aucune permission) | AuthController.java |
| POST | `/auth/refresh` | publique (SecurityConfig) | AuthController.java |
| POST | `/auth/reset-password` | publique (SecurityConfig) | AuthController.java |
| POST | `/roles` | ROLE_MANAGE | RoleController.java |
| POST | `/roles/search` | ROLE_MANAGE, USER_MANAGE | RoleController.java |
| POST | `/users` | USER_MANAGE | UserController.java |
| POST | `/users/search` | USER_MANAGE | UserController.java |
| POST | `/users/{id}/reset-password` | USER_MANAGE | UserController.java |
| PUT | `/roles/{id}` | ROLE_MANAGE | RoleController.java |
| PUT | `/users/{id}` | USER_MANAGE | UserController.java |
| PUT | `/users/{id}/permissions-refusees` | USER_MANAGE | UserController.java |

### Actions d'audit

- `ROLE_CREATION` (RoleService.java)
- `ROLE_MODIFICATION` (RoleService.java)
- `ROLE_SUPPRESSION` (RoleService.java)
- `UTILISATEUR_CREATION` (UserService.java)
- `UTILISATEUR_MODIFICATION` (UserService.java)
- `UTILISATEUR_PERMISSIONS_REFUSEES` (UserService.java)

### Entités et tables

| Entité | Table | Historisée (`@Audited`) |
|---|---|---|
| Permission | `permission` | oui |
| RefreshToken | `refresh_token` | non |
| ResetPasswordToken | `reset_password_token` | non |
| Role | `role` | oui |
| Utilisateur | `utilisateur` | oui |

### Exceptions métier

`EmailAlreadyExistsException`, `IaDesactiveeException`, `InvalidCredentialsException`, `InvalidReferenceException`, `InvalidRefreshTokenException`, `InvalidResetTokenException`, `MotDePasseNonConformeException`, `ProtectedRoleException`, `RoleAlreadyExistsException`, `RoleInUseException`, `RoleNotFoundException`, `UnknownPermissionException`, `UsernameAlreadyExistsException`, `UtilisateurNotFoundException`

### Clés de configuration lues

`security.admin.email`, `security.admin.password`, `security.admin.username`, `security.cookie.secure`, `security.cors.allowed-origins`, `security.cors.frontend-url`, `security.jwt.secret`, `security.mail.from`, `security.mcp.enabled`, `security.mcp.key-id`, `security.mcp.previous-key-id`, `security.mcp.previous-public-key`, `security.mcp.private-key`, `spring.application.name`, `springdoc.api-docs.enabled`


## chantier

### Routes

| Verbe | Chemin | Permission | Source |
|---|---|---|---|
| DELETE | `/chantiers/{id}` | CHANTIER_DELETE | ChantierController.java |
| GET | `/chantiers/carte` | CARTE_READ | ChantierController.java |
| GET | `/chantiers/{id}` | CHANTIER_READ | ChantierController.java |
| POST | `/chantiers` | CHANTIER_WRITE | ChantierController.java |
| POST | `/chantiers/search` | CHANTIER_READ | ChantierController.java |
| POST | `/chantiers/sync` | CHANTIER_SYNC | ChantierSyncController.java |
| PUT | `/chantiers/{id}` | CHANTIER_READ, CHANTIER_WRITE | ChantierController.java |
| PUT | `/chantiers/{id}/statut` | CHANTIER_WRITE | ChantierController.java |

### Actions d'audit

- `CHANTIER_CREATION` (ChantierService.java)
- `CHANTIER_MODIFICATION` (ChantierService.java)
- `CHANTIER_SUPPRESSION` (ChantierService.java)
- `CHANTIER_SYNCHRONISATION` (ChantierSyncService.java)

### Métriques

- `rh.chantier.sync.duration`
- `rh.chantier.sync.failure`
- `rh.chantier.sync.records.ignored`
- `rh.chantier.sync.success`

### Entités et tables

| Entité | Table | Historisée (`@Audited`) |
|---|---|---|
| Chantier | `chantier` | oui |

### Exceptions métier

`ChantierAlreadyExistsException`, `ChantierLocalisationException`, `ChantierNotFoundException`


## common

### Exceptions métier

`ConflitModificationException`


## employee

### Routes

| Verbe | Chemin | Permission | Source |
|---|---|---|---|
| DELETE | `/employees/{id}` | EMPLOYEE_DELETE | EmployeeController.java |
| GET | `/employees/import/modele` | EMPLOYEE_IMPORT | EmployeeImportController.java |
| GET | `/employees/{id}` | EMPLOYEE_READ | EmployeeController.java |
| POST | `/employees` | EMPLOYEE_WRITE | EmployeeController.java |
| POST | `/employees/analytique` | EMPLOYEE_READ | EmployeeAnalytiqueController.java |
| POST | `/employees/import` | EMPLOYEE_IMPORT | EmployeeImportController.java |
| POST | `/employees/regroupements` | EMPLOYEE_READ | EmployeeAnalytiqueController.java |
| POST | `/employees/search` | EMPLOYEE_READ | EmployeeController.java |
| PUT | `/employees/{id}` | EMPLOYEE_WRITE | EmployeeController.java |

### Actions d'audit

- `EMPLOYE_CREATION` (EmployeeService.java)
- `EMPLOYE_IMPORT` (EmployeeImportService.java)
- `EMPLOYE_MODIFICATION` (EmployeeService.java)
- `EMPLOYE_SORTIE` (EmployeeService.java)
- `EMPLOYE_SUPPRESSION` (EmployeeService.java)

### Entités et tables

| Entité | Table | Historisée (`@Audited`) |
|---|---|---|
| Employee | `employe` | oui |
| EmployeeSortie | `employe_sortie` | oui |

### Exceptions métier

`CinAlreadyExistsException`, `EmployeeImportException`, `EmployeeNotFoundException`, `InvalidReferenceException`


## equipe

### Routes

| Verbe | Chemin | Permission | Source |
|---|---|---|---|
| DELETE | `/equipes/{id}` | EQUIPE_DELETE | EquipeController.java |
| GET | `/equipes/import/modele` | EQUIPE_IMPORT | EquipeImportController.java |
| GET | `/equipes/{id}` | EQUIPE_READ | EquipeController.java |
| POST | `/equipes` | EQUIPE_WRITE | EquipeController.java |
| POST | `/equipes/import` | EQUIPE_IMPORT | EquipeImportController.java |
| POST | `/equipes/search` | EQUIPE_READ | EquipeController.java |
| PUT | `/equipes/{id}` | EQUIPE_READ, EQUIPE_WRITE | EquipeController.java |

### Actions d'audit

- `EQUIPE_CREATION` (EquipeService.java)
- `EQUIPE_IMPORT` (EquipeImportService.java)
- `EQUIPE_MODIFICATION` (EquipeService.java)
- `EQUIPE_SUPPRESSION` (EquipeService.java)

### Entités et tables

| Entité | Table | Historisée (`@Audited`) |
|---|---|---|
| Equipe | `equipe` | oui |

### Exceptions métier

`EquipeAlreadyExistsException`, `EquipeImportException`, `EquipeNotFoundException`


## function

### Routes

| Verbe | Chemin | Permission | Source |
|---|---|---|---|
| DELETE | `/functions/{id}` | FUNCTION_DELETE | FunctionController.java |
| GET | `/functions/import/modele` | FUNCTION_IMPORT | FunctionImportController.java |
| GET | `/functions/{id}` | FUNCTION_READ | FunctionController.java |
| POST | `/functions` | FUNCTION_WRITE | FunctionController.java |
| POST | `/functions/import` | FUNCTION_IMPORT | FunctionImportController.java |
| POST | `/functions/search` | FUNCTION_READ | FunctionController.java |
| PUT | `/functions/{id}` | FUNCTION_READ, FUNCTION_WRITE | FunctionController.java |

### Actions d'audit

- `FONCTION_CREATION` (FunctionService.java)
- `FONCTION_IMPORT` (FunctionImportService.java)
- `FONCTION_MODIFICATION` (FunctionService.java)
- `FONCTION_SUPPRESSION` (FunctionService.java)

### Entités et tables

| Entité | Table | Historisée (`@Audited`) |
|---|---|---|
| Function | `fonction` | oui |

### Exceptions métier

`FunctionAlreadyExistsException`, `FunctionImportException`, `FunctionNotFoundException`


## heuresupp

### Routes

| Verbe | Chemin | Permission | Source |
|---|---|---|---|
| DELETE | `/heures-supp/{id}` | HEURES_SUP_DELETE, PAIE_READ | HeuresSuppController.java |
| GET | `/heures-supp/import/modele` | HEURES_SUP_IMPORT, PAIE_READ | HeuresSuppImportController.java |
| GET | `/heures-supp/import/prerequis` | CHANTIER_READ, HEURES_SUP_IMPORT, PAIE_READ | HeuresSuppImportController.java |
| GET | `/heures-supp/periodes` | HEURES_SUP_READ, PAIE_READ | HeuresSuppController.java |
| GET | `/heures-supp/{id}` | HEURES_SUP_READ, PAIE_READ | HeuresSuppController.java |
| POST | `/heures-supp` | CHANTIER_READ, EMPLOYEE_READ, HEURES_SUP_DELETE, HEURES_SUP_IMPORT, PAIE_READ | HeuresSuppController.java |
| POST | `/heures-supp/analytique` | HEURES_SUP_IMPORT, HEURES_SUP_READ, PAIE_READ | HeuresSuppController.java |
| POST | `/heures-supp/export/pdf` | HEURES_SUP_READ, PAIE_READ | HeuresSuppExportController.java |
| POST | `/heures-supp/import` | EMPLOYEE_READ, HEURES_SUP_IMPORT, PAIE_READ | HeuresSuppImportController.java |
| POST | `/heures-supp/import/analyse` | EMPLOYEE_READ, EMPLOYEE_WRITE, FUNCTION_READ, HEURES_SUP_IMPORT, PAIE_READ | HeuresSuppImportController.java |
| POST | `/heures-supp/import/corrections` | EMPLOYEE_READ, EMPLOYEE_WRITE, FUNCTION_READ, HEURES_SUP_IMPORT, PAIE_READ | HeuresSuppImportController.java |
| POST | `/heures-supp/import/remplacement` | EMPLOYEE_READ, HEURES_SUP_IMPORT, PAIE_READ | HeuresSuppImportController.java |
| POST | `/heures-supp/search` | HEURES_SUP_READ, PAIE_READ | HeuresSuppController.java |
| PUT | `/heures-supp/{id}` | HEURES_SUP_IMPORT, PAIE_READ | HeuresSuppController.java |

### Actions d'audit

- `HEURES_SUP_CREATION_UNITAIRE` (HeuresSuppService.java)
- `HEURES_SUP_EXPORT_PDF` (HeuresSuppExportPdfService.java)
- `HEURES_SUP_IMPORT` (HeuresSuppImportService.java)
- `HEURES_SUP_IMPORT_CORRECTION` (HeuresSuppImportService.java)
- `HEURES_SUP_MODIFICATION` (HeuresSuppService.java)
- `HEURES_SUP_REMPLACEMENT` (HeuresSuppImportService.java)
- `HEURES_SUP_SUPPRESSION` (HeuresSuppService.java)
- `HEURES_SUP_SUPPRESSION_MOIS` (HeuresSuppService.java)

### Entités et tables

| Entité | Table | Historisée (`@Audited`) |
|---|---|---|
| HeureSupp | `heures_supp` | oui |

### Exceptions métier

`HeuresSuppGroupeModifieException`, `HeuresSuppImportException`, `InvalidHeuresSuppPeriodeException`


## mcp

### Outils MCP

- `accueil_lire` (OutilsAccueil.java)
- `audit_historique` (OutilsAdministration.java)
- `audit_rechercher` (OutilsAdministration.java)
- `chantier_fiche` (OutilsReferentiels.java)
- `chantier_rechercher` (OutilsReferentiels.java)
- `employe_fiche` (OutilsEmploye.java)
- `employe_parcours` (OutilsEmploye.java)
- `employes_compter` (OutilsEmploye.java)
- `employes_rechercher` (OutilsEmploye.java)
- `employes_regrouper` (OutilsEmploye.java)
- `employes_sorties` (OutilsEmploye.java)
- `equipe_fiche` (OutilsReferentiels.java)
- `equipe_rechercher` (OutilsReferentiels.java)
- `fonction_fiche` (OutilsReferentiels.java)
- `fonction_rechercher` (OutilsReferentiels.java)
- `heures_supp_import_prerequis` (OutilsHeuresSupp.java)
- `heures_supp_indicateurs` (OutilsHeuresSupp.java)
- `heures_supp_periodes` (OutilsHeuresSupp.java)
- `heures_supp_rechercher` (OutilsHeuresSupp.java)
- `paie_bulletins_rechercher` (OutilsPaie.java)
- `paie_comparer` (OutilsPaie.java)
- `paie_evolution` (OutilsPaie.java)
- `paie_indicateurs` (OutilsPaie.java)
- `paie_mouvements` (OutilsPaie.java)
- `paie_periodes` (OutilsPaie.java)
- `paie_qualite` (OutilsPaie.java)
- `paie_repartition` (OutilsPaie.java)
- `parametres_lire` (OutilsAdministration.java)
- `rapport_preparer` (OutilsPaie.java)
- `roles_lister` (OutilsAdministration.java)
- `systeme_identite` (OutilIdentite.java)

### Actions d'audit

- `MCP_ACCUEIL_LIRE` (OutilsAccueil.java)
- `MCP_AUDIT_HISTORIQUE` (OutilsAdministration.java)
- `MCP_AUDIT_RECHERCHER` (OutilsAdministration.java)
- `MCP_CHANTIER_FICHE` (OutilsReferentiels.java)
- `MCP_CHANTIER_RECHERCHER` (OutilsReferentiels.java)
- `MCP_EMPLOYES_COMPTER` (OutilsEmploye.java)
- `MCP_EMPLOYES_RECHERCHER` (OutilsEmploye.java)
- `MCP_EMPLOYES_REGROUPER` (OutilsEmploye.java)
- `MCP_EMPLOYES_SORTIES` (OutilsEmploye.java)
- `MCP_EMPLOYE_FICHE` (OutilsEmploye.java)
- `MCP_EMPLOYE_PARCOURS` (OutilsEmploye.java)
- `MCP_EQUIPE_FICHE` (OutilsReferentiels.java)
- `MCP_EQUIPE_RECHERCHER` (OutilsReferentiels.java)
- `MCP_FONCTION_FICHE` (OutilsReferentiels.java)
- `MCP_FONCTION_RECHERCHER` (OutilsReferentiels.java)
- `MCP_HEURES_SUP_IMPORT_PREREQUIS` (OutilsHeuresSupp.java)
- `MCP_HEURES_SUP_INDICATEURS` (OutilsHeuresSupp.java)
- `MCP_HEURES_SUP_PERIODES` (OutilsHeuresSupp.java)
- `MCP_HEURES_SUP_RECHERCHER` (OutilsHeuresSupp.java)
- `MCP_PAIE_BULLETINS_RECHERCHER` (OutilsPaie.java)
- `MCP_PAIE_COMPARER` (OutilsPaie.java)
- `MCP_PAIE_EVOLUTION` (OutilsPaie.java)
- `MCP_PAIE_INDICATEURS` (OutilsPaie.java)
- `MCP_PAIE_MOUVEMENTS` (OutilsPaie.java)
- `MCP_PAIE_PERIODES` (OutilsPaie.java)
- `MCP_PAIE_QUALITE` (OutilsPaie.java)
- `MCP_PAIE_REPARTITION` (OutilsPaie.java)
- `MCP_PARAMETRES_LIRE` (OutilsAdministration.java)
- `MCP_RAPPORT_PREPARER` (OutilsPaie.java)
- `MCP_ROLES_LISTER` (OutilsAdministration.java)


## paie

### Routes

| Verbe | Chemin | Permission | Source |
|---|---|---|---|
| DELETE | `/paie/{id}` | PAIE_DELETE | PaieController.java |
| GET | `/paie/chantiers` | PAIE_READ | PaieController.java |
| GET | `/paie/employes/{id}/parcours` | PAIE_READ | PaieParcoursController.java |
| GET | `/paie/import/modele` | PAIE_IMPORT | PaieImportController.java |
| GET | `/paie/materiel` | PAIE_READ | PaieController.java |
| GET | `/paie/periodes` | PAIE_READ | PaieController.java |
| GET | `/paie/{id}` | PAIE_READ | PaieController.java |
| POST | `/paie` | EMPLOYEE_WRITE, PAIE_WRITE | PaieController.java |
| POST | `/paie/analytique` | PAIE_READ | PaieController.java |
| POST | `/paie/chantiers/search` | PAIE_READ | PaieController.java |
| POST | `/paie/effectifs` | PAIE_READ | PaieEffectifsController.java |
| POST | `/paie/export` | PAIE_EXPORT | PaieExportController.java |
| POST | `/paie/import` | PAIE_IMPORT | PaieImportController.java |
| POST | `/paie/import/analyse` | EMPLOYEE_WRITE, PAIE_IMPORT, PAIE_READ | PaieImportController.java |
| POST | `/paie/import/corrections` | EMPLOYEE_WRITE, PAIE_IMPORT, PAIE_READ | PaieImportController.java |
| POST | `/paie/options/chantiers` | PAIE_DELETE, PAIE_READ | PaieController.java |
| POST | `/paie/options/equipes` | PAIE_DELETE, PAIE_READ | PaieController.java |
| POST | `/paie/periodes/search` | PAIE_READ | PaieController.java |
| POST | `/paie/report/pdf` | PAIE_EXPORT | PaieReportController.java |
| POST | `/paie/restauration/{idEntreeAudit}` | PAIE_RESTORE | PaieController.java |
| POST | `/paie/search` | PAIE_READ | PaieController.java |
| POST | `/paie/suppression` | PAIE_PURGE | PaieController.java |
| PUT | `/paie/{id}` | EMPLOYEE_WRITE, PAIE_READ, PAIE_WRITE | PaieController.java |

### Actions d'audit

- `PAIE_CREATION` (PaieService.java)
- `PAIE_EXPORT_EXCEL` (PaieExportService.java)
- `PAIE_IMPORT` (PaieImportService.java)
- `PAIE_IMPORT_CORRECTION` (PaieImportService.java)
- `PAIE_MODIFICATION` (PaieService.java)
- `PAIE_RAPPORT_PDF` (PaieReportHtmlPdfService.java)
- `PAIE_RESTAURATION_GROUPE` (PaieService.java)
- `PAIE_SUPPRESSION` (PaieService.java)
- `PAIE_SUPPRESSION_GROUPE` (PaieService.java)

### Entités et tables

| Entité | Table | Historisée (`@Audited`) |
|---|---|---|
| Paie | `paie` | oui |

### Exceptions métier

`AucunePaiePeriodeException`, `InvalidPeriodeException`, `InvalidReferenceException`, `PaieAlreadyExistsException`, `PaieGroupeModifieException`, `PaieGroupeRestaurationConflictException`, `PaieImportException`, `PaieLieeException`, `PaieNotFoundException`, `ParcoursEmployeIntrouvableException`


## parametre

### Routes

| Verbe | Chemin | Permission | Source |
|---|---|---|---|
| GET | `/parametres` | PARAMETRE_READ | ParametreController.java |
| PUT | `/parametres/{id}` | PARAMETRE_WRITE | ParametreController.java |

### Actions d'audit

- `PARAMETRE_MODIFICATION` (ParametreService.java)

### Entités et tables

| Entité | Table | Historisée (`@Audited`) |
|---|---|---|
| Parametre | `parametre` | oui |

### Exceptions métier

`ParametreInvalideException`, `ParametreNotFoundException`


## referentiel


## support

## Migrations Flyway

- `V1__enable_extensions.sql`
- `V2__create_schema.sql`
- `V3__create_auth_schema.sql`
- `V4__seed_permissions_et_roles.sql`
- `V5__add_chantier_nom.sql`
- `V6__seed_chantier_noms.sql`
- `V7__create_equipe.sql`
- `V8__paie_equipe_fk.sql`
- `V9__seed_equipe_permissions.sql`
- `V10__refresh_token_famille.sql`
- `V11__audit_schema.sql`
- `V12__seed_audit_permission.sql`
- `V13__liaisons_sans_cascade.sql`
- `V14__audit_etat_initial.sql`
- `V15__permission_paie_purge.sql`
- `V16__parametres_administrables.sql`
- `V17__permission_paie_restore.sql`
- `V18__verrou_optimiste_entites.sql`
- `V19__chaine_hachage_journal_audit.sql`
- `V20__activer_pgaudit.sql`
- `V21__verrouillage_temporaire_connexion.sql`
- `V22__unicite_cin_insensible_casse.sql`
- `V23__unicite_libelle_fonction_insensible_casse.sql`
- `V24__unicite_code_chantier_insensible_casse.sql`
- `V25__unicite_equipe_normalisee.sql`
- `V26__jours_travailles_fractionnaires.sql`
- `V27__unicite_identifiants_normalises.sql`
- `V28__carte_chantiers_permission_et_role.sql`
- `V29__employe_etat_du_dernier_mois.sql`
- `V30__employe_reprise_depuis_la_paie.sql`
- `V31__fonctions_et_chantiers_sans_paie.sql`
- `V32__permission_equipe_import.sql`
- `V33__employe_inactif_sans_affectation.sql`
- `V34__fusion_equipe_ch_plus_op.sql`
- `V35__cloturer_chantiers_absents_derniere_paie.sql`
- `V36__permission_ia_utiliser.sql`
- `V37__chantier_nature_et_localisation.sql`
- `V38__reprise_qualification_chantiers.sql`
- `V39__heures_supp_mensuelles.sql`
- `V40__permissions_heures_supp.sql`
- `V41__permissions_suppression_heures_supp.sql`
- `V42__accueil_personnalise.sql`
- `V43__heures_supp_salaire_horaire_entier.sql`
- `V44__heures_supp_montants_entiers.sql`

## Modèles de rapport (PDF)

- `LiberationSerif-Bold.ttf`
- `LiberationSerif-BoldItalic.ttf`
- `LiberationSerif-Italic.ttf`
- `LiberationSerif-Regular.ttf`
- `logo-staport.png`
- `rapport.css`
- `rapport.css`

## Clés de `application.yml`

`ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_USERNAME`, `CHANTIER_SYNC_BASE_URL`, `COOKIE_SECURE`, `CORS_ALLOWED_ORIGINS`, `DB_HOST`, `DB_MIGRATION_PASSWORD`, `DB_MIGRATION_USER`, `DB_NAME`, `DB_PASSWORD`, `DB_PORT`, `DB_USER`, `FRONTEND_URL`, `JWT_SECRET`, `LOGGING_FILE_PATH`, `LOGGING_FORMAT`, `MAIL_FROM`, `MCP_ENABLED`, `MCP_JWT_KEY_ID`, `MCP_JWT_PREVIOUS_KEY_ID`, `MCP_JWT_PREVIOUS_PUBLIC_KEY`, `MCP_JWT_PRIVATE_KEY`, `PGAUDIT_ENABLED`, `SMTP_AUTH`, `SMTP_HOST`, `SMTP_PASSWORD`, `SMTP_PORT`, `SMTP_STARTTLS`, `SMTP_USERNAME`, `SPRINGDOC_API_DOCS_ENABLED`, `SPRINGDOC_SWAGGER_UI_ENABLED`, `SPRING_JPA_SHOW_SQL`, `security.mcp.enabled`, `spring.application.name`
