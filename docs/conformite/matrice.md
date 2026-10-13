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
| `jpa.md` | Entités, repositories, transactions, chargement | [`jpa-2026-10-12.md`](jpa-2026-10-12.md), entités, repositories, `ArchitectureConventionsTest`, `PageLoaderTest` | Pas d'entité exposée, pas d'EAGER, transactions et requêtes bornées | Partiel — CI en attente | Confirmer compilation et tests Maven par la CI avant de passer conforme |
| `database.md` | Flyway, contraintes, audit SQL, migrations de données | [`database-2026-10-12.md`](database-2026-10-12.md), V1→V21, `PaieApplicationTests`, `AuditIntegriteTest` | PostgreSQL réel : base vierge + mise à niveau + `ddl-auto=validate` + droits/audit | Conforme localement (preuve du 2026-10-11) | Migration PG17→18 et répétition de V16→V21 sur restauration uniquement côté serveur — suivies dans `TODO.md` |
| `testing.md` | Backend, frontend, contrats, E2E, full stack | `docs/testing.md`, `.github/workflows/ci.yml`, CI 38204503967 | Portes bloquantes et preuves exécutées | Conforme (CI) | Maintenir les portes sur chaque changement |
| `deployment.md` | Images, Compose, nginx inner/outer, migration PG | [`deployment-2026-10-12.md`](deployment-2026-10-12.md), `docker-compose.yml`, Dockerfiles, `docs/deployment.md` | Build local, santé, non-root, réseau, tags immuables, rollback documenté | Conforme localement | Nginx outer, CD et migration PG17→18 restent dans `TODO.md` car ils exigent l'hôte de production |
| `backup.md` | Création, chiffrement, rétention, restauration locale ; destination indépendante sur l'hôte | [`backup-2026-10-12.md`](backup-2026-10-12.md), `backup/`, Compose, `docs/deployment.md` | Archive chiffrée vérifiée, intégrité et restauration isolée | Conforme localement | Activer clé, alertes et copie hors hôte en production — `TODO.md` |
| `security.md` | Authentification, RBAC, sessions, portée, secrets | [`security-2026-10-12.md`](security-2026-10-12.md), `JwtSecurityChainTest`, `JwtSigningKeyTest`, `EndpointSecurityTest`, `AuthServiceTest`, `VerrouillageConnexionIntegrationTest` | Refus par défaut, permissions effectives, validation JWT, CORS/CSRF, rotation et verrouillage | Conforme localement | Secrets, TLS/cookie, origines, rate limit et validation du verrouillage en production — `TODO.md` |
| `audit.md` | Envers, journal, sécurité, migrations, consultation | [`audit-2026-10-12.md`](audit-2026-10-12.md), `Audit*Test`, `docs/audit/README.md`, `docs/rbac/audit.md` | Couverture des écritures et accès, atomicité, intégrité, minimisation, permissions, conservation | Conforme localement | pgAudit, protection/rétention des CSV et alertes restent des contrôles d'hôte de production dans `TODO.md` |
| `agents-ia.md` | Agents et usages IA éventuels | `docs/conformite/applicabilite.md`, code | Applicabilité, identité, permissions et évaluation | Conforme | Réexaminer uniquement si une capacité IA est introduite |
| `agent-ui.md` | AG-UI, A2UI, événements d'interface | `docs/conformite/applicabilite.md`, frontend et intégrations | Applicabilité et contrats si une interface agentique existe | Conforme | Réexaminer uniquement si un flux agentique est introduit |
| `mcp.md` | Outils MCP, schémas, limites, permissions | `docs/conformite/applicabilite.md`, code et configuration | Applicabilité ; aucun outil implicite ou non autorisé | Conforme | Réexaminer avant le premier outil MCP |
| `rag.md` | Embeddings, index, provenance, suppression | `docs/conformite/applicabilite.md`, code et migrations | Applicabilité ; aucune donnée transactionnelle redéfinie | Conforme | Réexaminer si un pipeline RAG est livré |
| `logging.md` | Format, corrélation, données sensibles, rétention | [`logging-2026-10-12.md`](logging-2026-10-12.md), Logback, `MdcRequestFilterTest`, `MdcRequestIdTaskDecoratorTest`, `LogbackConfigurationTest` | Aucun secret/PII inutile, corrélation HTTP/async, rotation et rétention vérifiées | Conforme localement | ACL, capacité disque et purge effective sur l'hôte de production — `TODO.md` |
| `swagger.md` | Tags, opérations, schémas, exposition | [`swagger-2026-10-12.md`](swagger-2026-10-12.md), `OpenApiContractTest`, `ArchitectureConventionsTest`, `DocumentationApi*Test` | Contrat généré, réponses d'erreur/fichiers et exposition | Conforme localement (18 tests) | Maintenir les assertions de contrat dans la CI ; aucun artefact publié à comparer pour les breaking changes |
| `metrics.md` | Métriques techniques et métier, cardinalité, exposition, supervision | [`metrics-2026-10-12.md`](metrics-2026-10-12.md), `MetricsConformityTest`, `AuditDefaillanceTest`, `AuditIntegriteTest`, `SupervisionTest` | Séries utiles, types/unités/tags bornés, endpoints limités, signaux et actions documentés | Conforme localement | Brancher le collecteur, le tableau de bord et les alertes privés sur l'hôte, puis valider seuils et routage — `TODO.md` |
| `performance.md` | Pagination, limites, temps de réponse, charge | [`performance-2026-10-12.md`](performance-2026-10-12.md), `PerformanceProfileTest`, `AuditConsultationTest`, `PageLoaderTest`, `application.yml`, Nginx | Contrôle exhaustif, profil approuvé, mesure PostgreSQL reproductible, saturation SMTP, validation Nginx | Conforme localement — recherches, import, Excel et PDF dans les seuils ; SMTP borné et rejet sous saturation vérifiés | Mesurer HTTP de bout en bout et rejouer le profil sur l'hôte d'exploitation avec les dépendances réelles — `TODO.md` |
| `frontend.md` | Routes, guards, formulaires, erreurs, responsive, sélecteurs et tableaux | `frontend/README.md`, `paie/README.md`, tests Angular, parcours Playwright, build de production, audit npm et licences | Permission serveur + UX cohérente et accessible | Partiel — libellés compacts Paie et placement/défilement du menu de colonnes en attente de CI et d'image | Commit/push des correctifs, CI verte et nouvelle image Compose pour confirmer le rendu |
| `design-system.md` | Tokens, composants, contrastes, états | [`design-system-2026-10-13.md`](design-system-2026-10-13.md), inventaire de `docs/frontend/README.md`, specs de `frontend/src/app/shared/ui`, catalogue, axe | Composants cohérents et états accessibles dans les deux thèmes et en contraste forcé | Partiel — CI `560fcf0` : build et 665 tests unitaires verts ; E2E du défilement clavier en échec ; correctif en cours | Rejouer l'E2E après correction ; vérifier l'image Compose, contraste forcé, clavier et technologie d'assistance ; compléter la couverture des états |

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
