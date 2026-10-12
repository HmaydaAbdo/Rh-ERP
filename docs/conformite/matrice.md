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
| `configuration.md` | Variables, secrets, profils, bornes | `application.yml`, `.env.example`, docs configuration | Inventaire clé → type → source → validation | Partiel | Comparer toutes les clés aux usages |
| `jpa.md` | Entités, repositories, transactions, chargement | Entités, repositories, `ArchitectureConventionsTest` | Pas d'entité exposée, pas d'EAGER, transactions et requêtes bornées | Partiel | Contrôle repository/service par domaine |
| `database.md` | Flyway, contraintes, audit SQL, migrations de données | `db/migration`, `PaieApplicationTests`, `AuditIntegriteTest` | Base vierge + mise à niveau + schéma/audit cohérents | Partiel | Vérifier V1→V21 et chaque table |
| `testing.md` | Backend, frontend, contrats, E2E, full stack | `docs/testing.md`, `.github/workflows/ci.yml`, CI 38204503967 | Portes bloquantes et preuves exécutées | Conforme (CI) | Maintenir les portes sur chaque changement |
| `deployment.md` | Images, Compose, nginx inner/outer, migration PG | `docker-compose.yml`, Dockerfiles, `docs/deployment.md` | Build, santé, non-root, réseau, rollback | Partiel | Contrôler avec une exécution isolée |
| `backup.md` | Création, rétention, restauration, copie indépendante | `backup/`, Compose, `docs/deployment.md` | Sauvegarde vérifiée + restauration périodique | À vérifier | Établir une preuve de restauration locale |
| `security.md` | Authentification, RBAC, sessions, portée, secrets | `JwtSecurityChainTest`, `EndpointSecurityTest`, `docs/auth`, `docs/rbac` | Refus par défaut, permissions effectives, absence de fuite | Partiel | CORS corrigé ; poursuivre les contrôles secrets, sessions et endpoints |
| `audit.md` | Envers, journal, sécurité, migrations, consultation | `Audit*Test`, `docs/audit/README.md` | Atomicité, intégrité, absence de secrets, accès dédié | Partiel | Vérifier les voies d'écriture de chaque domaine |
| `agents-ia.md` | Agents et usages IA éventuels | `docs/conformite/applicabilite.md`, code | Applicabilité, identité, permissions et évaluation | Conforme | Réexaminer uniquement si une capacité IA est introduite |
| `agent-ui.md` | AG-UI, A2UI, événements d'interface | `docs/conformite/applicabilite.md`, frontend et intégrations | Applicabilité et contrats si une interface agentique existe | Conforme | Réexaminer uniquement si un flux agentique est introduit |
| `mcp.md` | Outils MCP, schémas, limites, permissions | `docs/conformite/applicabilite.md`, code et configuration | Applicabilité ; aucun outil implicite ou non autorisé | Conforme | Réexaminer avant le premier outil MCP |
| `rag.md` | Embeddings, index, provenance, suppression | `docs/conformite/applicabilite.md`, code et migrations | Applicabilité ; aucune donnée transactionnelle redéfinie | Conforme | Réexaminer si un pipeline RAG est livré |
| `logging.md` | Format, corrélation, données sensibles, rétention | Logback, `docs/deployment.md`, tests supervision | Aucun secret/PII inutile, `requestId`, rotation | Partiel | Contrôle des messages et archives |
| `swagger.md` | Tags, opérations, schémas, exposition | Contrôleurs, `DocumentationApi*Test` | Documentation complète et exposition protégée | Partiel | Comparer routes réelles et documentation |
| `metrics.md` | Métriques techniques et métier, cardinalité | Micrometer, `SupervisionTest`, domaines | Séries utiles, bornées, sans données sensibles | Partiel | Inventaire métrique par domaine |
| `performance.md` | Pagination, limites, temps de réponse, charge | Services, repositories, nginx, CI | Bornes explicites et test de risque | À vérifier | Identifier les scénarios mesurables |
| `frontend.md` | Routes, guards, formulaires, erreurs, responsive | `frontend/README.md`, specs, Playwright | Permission serveur + UX cohérente et accessible | Partiel | Revue écran par domaine |
| `design-system.md` | Tokens, composants, contrastes, états | `frontend/src/app/shared/ui`, catalogue, axe | Composants cohérents et états accessibles | Partiel | Inventaire composants et exceptions |

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
