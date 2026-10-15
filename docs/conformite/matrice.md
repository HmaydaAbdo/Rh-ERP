# Matrice de conformité ERP-RH

Cette matrice est le registre de travail de l'audit exhaustif. Les conventions racine sont
normatives ; les fichiers de `docs/`, les tests et les rapports existants sont des pistes de preuve
qui doivent être revalidées contre le code courant.

Les passes de contrôle des 2026-10-11 et 2026-10-12 et leurs limites d'exécution sont consignées dans
[`controle-2026-10-11.md`](controle-2026-10-11.md).

## Légende

- **À vérifier** : aucune preuve actuelle suffisante ou périmètre non encore examiné.
- **Partiel** : une preuve existe, mais elle ne couvre pas encore tout le périmètre requis.
- **Conforme** : exigence vérifiée par une preuve reproductible et à jour.
- **Décision requise** : choix métier, d'architecture ou d'exploitation à faire valider avant correction.

## Registre courant

| Convention | Périmètre à contrôler | Preuves candidates | Contrôle attendu | Statut initial | Prochaine action |
|---|---|---|---|---|---|
| `architecture.md` | Backend, frontières des domaines, dépendances, interfaces | `ArchitectureConventionsTest`, `ChantierSyncClient`, CI 38204503967 | ArchUnit + revue des dépendances inter-domaines + bornes de l'adaptateur externe | Conforme (local/CI) | Contrôles d'exploitation externes uniquement dans `TODO.md` |
| `design-patterns.md` | Services, intégrations, workflows | [`patterns-2026-10-12.md`](patterns-2026-10-12.md), code backend/frontend | Vérifier chaque abstraction contre un besoin documenté | Conforme (revue) | Confirmer par la CI du commit documentaire |
| `configuration.md` | Variables, secrets, profils, bornes | `application.yml`, `.env.example`, `ChantierSyncProperties`, Compose, docs configuration | Inventaire clé → type → source → validation au démarrage | Conforme (revue + contrôles locaux) | Confirmer par la CI du commit |
| `jpa.md` | Entités, repositories, transactions, chargement | Migrations V18, `ArchitectureConventionsTest`, `VersionOptimisteTest`, `PageLoaderTest`, CI #237 (`255cd2c`) | Pas d'entité exposée, pas d'EAGER, versions optimistes, transactions et requêtes bornées | Conforme à 100 % — revue statique et CI complète verte, incluant les tests backend et le full-stack | Réexaminer lors d'une évolution des entités, accès aux données ou transactions |
| `database.md` | Flyway, contraintes, audit SQL, migrations de données | V1→V21, `PaieApplicationTests`, `AuditIntegriteTest`, PostgreSQL 18/pgvector 0.8.7 en CI [#38716785146](https://github.com/HmaydaAbdo/Rh-ERP/actions/runs/38716785146), preuve serveur PG18 du 2026-10-14 | Base vierge et `ddl-auto=validate`, migrations PostgreSQL réelles, rôles/droits séparés, pgAudit | Clôturé à 100 % côté dépôt ; bascule PG17→18 effectuée, Flyway V21 et backend sain confirmés sur le serveur | Comparer les volumes restaurés, confirmer le volume PG17 conservé et les événements pgAudit dans les journaux — `TODO.md` |
| `testing.md` | Backend, frontend, contrats, E2E, full stack | `docs/testing.md`, `.github/workflows/ci.yml`, CI 38204503967 | Portes bloquantes et preuves exécutées | Conforme (CI) | Maintenir les portes sur chaque changement |
| `deployment.md` | Images, Compose, nginx inner/outer, migration PG | [`deployment-2026-10-12.md`](deployment-2026-10-12.md), `docker-compose.yml`, Dockerfiles, `docs/deployment.md` | Build local, santé, non-root, réseau, tags immuables, rollback documenté | Conforme localement | Nginx outer et CD restent dans `TODO.md` ; la migration PG17→18 est effectuée |
| `backup.md` | Création, chiffrement, rétention, restauration locale ; destination indépendante sur l'hôte | [`backup-2026-10-12.md`](backup-2026-10-12.md), `backup/`, Compose, `docs/deployment.md` | Archive chiffrée vérifiée, intégrité et restauration isolée | Conforme localement | Activer clé, alertes et copie hors hôte en production — `TODO.md` |
| `security.md` | Authentification, RBAC, sessions, portée, secrets | [`security-2026-10-12.md`](security-2026-10-12.md), `JwtSecurityChainTest`, `JwtSigningKeyTest`, `EndpointSecurityTest`, `AuthServiceTest`, `VerrouillageConnexionIntegrationTest` | Refus par défaut, permissions effectives, validation JWT, CORS/CSRF, rotation et verrouillage | Conforme localement | Secrets, TLS/cookie, origines, rate limit et validation du verrouillage en production — `TODO.md` |
| `audit.md` | Envers, journal, sécurité, migrations, consultation | [`audit-2026-10-12.md`](audit-2026-10-12.md), `Audit*Test`, `docs/audit/README.md`, `docs/rbac/audit.md` | Couverture des écritures et accès, atomicité, intégrité, minimisation, permissions, conservation | Conforme localement | pgAudit, protection/rétention des CSV et alertes restent des contrôles d'hôte de production dans `TODO.md` |
| `agents-ia.md` | Agents et usages IA éventuels | `docs/conformite/applicabilite.md`, code | Applicabilité, identité, permissions et évaluation | Conforme | Réexaminer uniquement si une capacité IA est introduite |
| `agent-ui.md` | AG-UI, A2UI, événements d'interface | `docs/conformite/applicabilite.md`, frontend et intégrations | Applicabilité et contrats si une interface agentique existe | Conforme | Réexaminer uniquement si un flux agentique est introduit |
| `mcp.md` | Outils MCP, schémas, limites, permissions | `docs/conformite/applicabilite.md`, code et configuration | Applicabilité ; aucun outil implicite ou non autorisé | Conforme | Réexaminer avant le premier outil MCP |
| `rag.md` | Embeddings, index, provenance, suppression | `docs/conformite/applicabilite.md`, code et migrations | Applicabilité ; aucune donnée transactionnelle redéfinie | Conforme | Réexaminer si un pipeline RAG est livré |
| `logging.md` | Format, corrélation, données sensibles, rétention | [`logging-2026-10-12.md`](logging-2026-10-12.md), Logback, `MdcRequestFilterTest`, `MdcRequestIdTaskDecoratorTest`, `LogbackConfigurationTest` | Aucun secret/PII inutile, corrélation HTTP/async, rotation et rétention vérifiées | Conforme localement | ACL, capacité disque et purge effective sur l'hôte de production — `TODO.md` |
| `swagger.md` | Tags, opérations, schémas, exposition | `OpenApiContractTest`, `ArchitectureConventionsTest`, `DocumentationApiSecurityTest`, `DocumentationApiAllumeeSecurityTest`, CI [#240 (`dd96a43`)](https://github.com/HmaydaAbdo/Rh-ERP/actions/runs/38606304697) | Contrat généré OpenAPI 3.1, réponses d'erreur/fichiers, authentification et exposition | Conforme à 100 % — génération et parsing du contrat, interface Swagger réellement servie quand activée, API métier protégée, et documentation désactivée par défaut dans le Compose de production ; cinq jobs CI verts | Vérification de l'instance de production suivie dans `TODO.md` ; aucun artefact OpenAPI versionné indépendant à comparer pour les breaking changes |
| `metrics.md` | Métriques techniques et métier, cardinalité, exposition, supervision | `MetricsConformityTest`, `AuditDefaillanceTest`, `AuditIntegriteTest`, `SupervisionTest` ; inventaire dans [chantier/README.md](../chantier/README.md) et les classes `AuditMetrics` / `ChantierSyncMetrics` | Types et unités vérifiés, histogramme Prometheus observé, tags bornés, endpoints contrôlés et scénarios d'audit vérifiés | Conforme à 100 % côté dépôt — tests backend et CI [#38711756915 (`8df3723`)](https://github.com/HmaydaAbdo/Rh-ERP/actions/runs/38711756915), tous les jobs verts | Raccorder le collecteur privé, le tableau de bord et les alertes en production, puis valider les seuils et le routage — `TODO.md` |
| `performance.md` | Pagination, limites, temps de réponse, charge | `PerformanceProfileTest`, `AuditConsultationTest`, `PageLoaderTest`, `AsyncConfigTest`, `application.yml`, Nginx | Contrôle exhaustif, profil PostgreSQL répétable, saturation SMTP et configuration Nginx ; porte CI obligatoire | Conforme à 100 % côté dépôt — profil PostgreSQL, backend, frontend E2E, full-stack, backup et PostgreSQL verts dans la CI [#38715644287 (`8320122`)](https://github.com/HmaydaAbdo/Rh-ERP/actions/runs/38715644287) | Mesurer HTTP de bout en bout et rejouer le profil sur l'hôte d'exploitation avec les dépendances réelles — `TODO.md` |
| `frontend.md` | Routes, guards, formulaires, erreurs, responsive, sélecteurs et tableaux | CI `38547264561` sur `0d30593999eb5305f48a147bbd375596ee66c171`, 667 tests Angular, E2E, `AuditConsultationTest` 14/14, build Docker Node 24.15, audits npm/licences ; Compose : recherches rôles/audit vérifiées, HTTP 200 sur 5002, responsive à 390 px sans débordement de page | Permission serveur + UX cohérente et accessible | Clôturé à 100 % côté dépôt (revue complète, CI vert et contrôle runtime ; rapport détaillé supprimé après clôture) | Réexaminer lors de toute évolution frontend structurante |
| `design-system.md` | Tokens, composants, contrastes, états | CI #235 (`1b80317`) et #236 (`da126ad`), 669 tests Angular, 9 E2E Catalogue, vérification TypeScript, build de production, revue navigateur Compose et test manuel Narrateur Windows | Composants cohérents et états accessibles en thèmes clair/sombre et contraste forcé | Clôturé à 100 % côté dépôt — vérifications locales et CI vertes ; image frontend Compose `da126ad09416f43d4e79f1fd2486102a159d476c` confirmée active (ID `sha256:ae314ab1292162b58868a89d50854b41b179bec3f683ea42fb407a83cae82739`) ; analytique septembre affiche 1 009 bulletins conformément au compte SQL ; graphique et données accessibles vérifiés en clair/sombre et graphique confirmé lisible en contraste forcé par l’utilisateur | Réexaminer lors d’une évolution du kit ou des conventions |

## Axes de revue par domaine

Les domaines métier sont ensuite contrôlés avec la même grille :

| Domaine | Backend | Frontend | RBAC | Audit | Tests | Documentation |
|---|---|---|---|---|---|---|
| Auth / administration | partiel | partiel | partiel | partiel | partiel | conforme |
| Employé | partiel | partiel | partiel | partiel | partiel | conforme |
| Fonction | partiel | partiel | partiel | partiel | partiel | conforme |
| Chantier | partiel | partiel | partiel | partiel | partiel | conforme |
| Équipe | partiel | partiel | partiel | partiel | partiel | conforme |
| Paie | partiel | partiel | partiel | partiel | partiel | conforme |
| Paramètres | partiel | partiel | partiel | partiel | partiel | conforme |
| Audit | partiel | partiel | partiel | partiel | partiel | conforme |

Les scénarios de couverture par domaine et les parcours E2E sont présents dans le dépôt et ont été
exécutés par la CI 38204503967. La CI fournit la preuve reproductible lorsque l'environnement local
ne dispose pas de Maven Central ou des services nécessaires.

Un statut ne passe à **conforme** que lorsqu'une commande, un test ou un artefact permet de refaire
la vérification. Une absence de fonctionnalité IA/MCP/RAG est conforme lorsque son applicabilité est
explicitement documentée ; elle ne justifie pas l'ajout d'une fonctionnalité.
