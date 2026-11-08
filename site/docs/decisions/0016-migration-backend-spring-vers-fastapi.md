---
title: "ADR 0016 — Migration du backend de Spring vers FastAPI (un seul conteneur Python avec l'IA)"
sidebar_position: 17
---

- **Statut** : accepté le 2026-11-03 par le propriétaire (preuve de terminé de KAN-43)
- **Date** : 2026-11-02
- **Décideur** : propriétaire du projet
- **Suivi** : KAN-19 (E2), KAN-43 (cet ADR), KAN-44 (conventions), KAN-45 (inventaire), KAN-46 (bascule), KAN-47 (prototype)

## Contexte

Le backend est un monolithe modulaire Spring Boot (12 domaines, environ 24 000 lignes Java, 45 migrations Flyway). Le service IA est
un second conteneur Python (FastAPI, LangGraph, serveur AG-UI) qui appelle le backend par MCP (31 outils) et lui échange ses jetons.

Décision Q15 du propriétaire (2026-10-31) : migrer tout le backend vers Python, domaine par domaine, transversal d'abord
(`common`, `auth`, `audit`, `parametre`, MCP) puis métier (`function`, `equipe`, `chantier`, `employee`, `heuresupp`, `paie`).
Motif : les outils IA sont natifs en Python (LangChain, LangGraph, Deep Agents, SDK MCP) ; côté Spring ils obligent à maintenir
un second écosystème et une frontière réseau. Précision du 2026-11-02 : le backend FastAPI et le service IA tournent dans **un
seul conteneur** (moins de saut réseau, infrastructure plus simple, orchestration du streaming IA). Ces raisons sont des
hypothèses : elles sont **mesurées avant et après**, pas supposées.

La migration contredit trois décisions en vigueur, qu'elle remplace explicitement :

1. « Spring reste l'autorité » (`docs/ia.md`, `conventions/mcp.md`, `conventions/architecture.md`) ;
2. le serveur MCP en Spring AI (`conventions/mcp.md`, ADR 0015 pour le périmètre IA) ;
3. les migrations Flyway (`conventions/database.md`).

Garanties à conserver sans régression : RBAC et périmètres par fiche de poste, journal d'audit, calculs de paie et d'heures
supplémentaires, façades métier entre domaines, 31 outils MCP, tests par domaine et couverture, contrôles OSV et sécurité de la
CI, contrat OpenAPI consommé par le frontend (Angular aujourd'hui, Next.js ensuite). Aucune brique payante.

## Décision

### 0. Principe directeur : le meilleur écosystème, sur la seule documentation officielle

Objectif du propriétaire : adopter l'écosystème qui implémente le mieux les pratiques éprouvées et les tendances de l'IA, en
s'appuyant **uniquement sur la documentation officielle** de chaque composant, jamais sur une supposition de comportement.

- Chaque choix de cet ADR et chaque brique ajoutée ensuite repose sur la documentation officielle lue en entier (via Context7 puis
  la source officielle, règle d'`AGENTS.md`) ; les relectures d'entrée de l'épopée (KAN-47 : FastAPI, Pydantic, SQLAlchemy, SDK MCP)
  consignent ce qui a été lu.
- On utilise le composant officiel du framework (LangChain, LangGraph, Deep Agents, SDK MCP, AG-UI, CopilotKit, A2UI) avant
  d'écrire du code maison ; le code maison existant est résorbé par E10.
- **Clause de limite** : quand un composant atteint une limite documentée ou mesurée (fonction manquante, version instable,
  performance, licence payante), on n'écrit pas de contournement. On rédige un court comparatif sourcé (au moins deux
  concurrents gratuits, critères, limites, coût de sortie), on le propose au propriétaire, et on ne change qu'après son accord et,
  si le choix est structurant, un ADR. Les choix de cet ADR sont réexaminés par cette clause, notamment le moteur PDF (§ 5) et
  l'audit sans Envers (§ 2).

### 1. Forme cible : un monolithe modulaire Python, un conteneur

- Une application FastAPI unique, un processus de service, un conteneur. L'arborescence suit `conventions/architecture.md`
  (`domains/<domaine>`, `platform/`, `integrations/`) ; les frontières de domaine sont vérifiées par `import-linter` à la place
  d'ArchUnit, et un domaine n'appelle un autre que par sa façade publique.
- Le service IA actuel est absorbé comme un domaine de plus (`domains/ia` ou `platform/ia`). Le serveur MCP est monté dans la
  même application (le SDK documente le montage d'une application ASGI MCP dans un hôte FastAPI/Starlette ; la durée de vie de
  l'hôte doit entrer `session_manager.run()`, sinon la première requête échoue). Les outils MCP appellent directement les façades
  de domaine en processus : le saut HTTP « agent → backend » disparaît, la sécurité (permissions, périmètres, audit) ne change pas.
- Le MCP reste le contrat des outils de l'agent (décision d'E7 non rouverte) ; le choix MCP ou appel direct par outil LangChain est
  tranché au prototype KAN-47 sur mesure de latence, sans affaiblir l'identité ni l'audit.

### 2. Accès aux données : SQLAlchemy 2.x (ORM) avec psycopg 3

- SQLAlchemy 2.x, style déclaratif typé (`Mapped`, `mapped_column`), pilote psycopg 3 (déjà employé par le service IA), sessions
  asynchrones fournies par une dépendance FastAPI avec `yield`. Pydantic remplace MapStruct pour les DTO.
- **Verrouillage optimiste** : `version_id_col` de SQLAlchemy (documenté) sur les colonnes `version BIGINT` existantes ; le contrat
  « Cette ligne a été modifiée entre-temps » (HTTP 409) est conservé.
- **Audit** : les tables d'historique `*_aud` et le journal d'audit existants sont conservés tels quels (même schéma, mêmes
  lectures). Hibernate Envers est remplacé par un écouteur de session SQLAlchemy (`before_flush`, documenté) et par un décorateur
  d'action auditée équivalent à `@AuditableAction`. Une bibliothèque tierce de versionnage n'est retenue que si le prototype
  KAN-47 prouve qu'elle reproduit exactement les colonnes actuelles ; sinon écouteur maison, petit et testé.
- Les calculs monétaires restent en `Decimal` avec les mêmes règles d'arrondi (S/H, montants entiers `HALF_DOWN` des heures
  supplémentaires, `NUMERIC` en base). Chaque règle est reproduite par un test de parité (mêmes entrées, mêmes sorties que Java).

### 3. Migrations : Flyway figé dans la branche de migration, Alembic dès la tranche transversale

- Dans la branche de migration (§ 7), le code Spring et ses migrations Flyway V1 à V44 restent **intacts** : ils servent de
  référence exécutable pour les tests de parité. Alembic prend le relais pour tout nouveau schéma dès la tranche transversale
  (KAN-48) : une révision de base représente le schéma V44 ; les bases existantes sont « estampillées » sur cette révision
  (`alembic stamp`, mécanisme documenté), les bases neuves sont construites à partir d'elle.
- Une migration Flyway qui atterrit sur `main` pendant la migration (V45 et suivantes) est reportée en révision Alembic au
  prochain rapprochement de branche ; le contrôle d'autogénération détecte toute dérive entre modèles et base.
- Les révisions Alembic sont écrites à la main en SQL explicite (`op.execute`) pour garder les contraintes `CHECK`, les index et
  les règles de `conventions/database.md` ; l'autogénération sert de contrôle, pas de source de vérité.
- Exécution : étape de déploiement dédiée avant le démarrage de l'application, jamais dans sa durée de vie (plusieurs démarrages
  simultanés ne doivent pas migrer en parallèle). La table `flyway_schema_history` est conservée en lecture seule.

### 4. Authentification et autorisation

- Contrat externe inchangé au basculement : mêmes routes `/auth/*`, mêmes cookies et jetons de rafraîchissement, mêmes hachages de
  mots de passe vérifiables sans réinitialisation (format confirmé à l'inventaire KAN-45), pour ne déconnecter personne.
- Aujourd'hui : jeton d'accès utilisateur signé HS256, jeton MCP signé RS256 avec rotation de clé. Cible : **RS256 pour tous les
  jetons** (clé privée seule sur le serveur, clé publique publiable), via une bibliothèque JWT maintenue ; le passage de HS256 à
  RS256 est une rupture de session assumée, planifiée avec la bascule du domaine `auth` (KAN-46), non faite en silence.
  Précision (KAN-213) : un **seul jeu de clés** signe les jetons utilisateur et les jetons de l'agent IA, séparés par leur
  audience ; il reprend les variables `MCP_JWT_*` déjà obligatoires en production, donc aucun nouveau secret à créer.
  Les empreintes BCrypt de Spring restent vérifiables et sont remplacées par Argon2 à la première connexion réussie.
- RBAC et périmètres par fiche de poste : dépendances FastAPI et façade `platform/identite` ; chaque route et chaque outil MCP
  déclare sa permission, comme le font les contrôles actuels (`EndpointSecurityTest` est réécrit en test de couverture des routes).

### 5. Tâches de fond, rapports et fichiers

- Pas de courtier de messages au départ. Les traitements longs (PDF, import Excel, exports) s'exécutent dans un pool de threads
  (`run_in_threadpool`) pour ne pas bloquer la boucle d'événements ; les planifications éventuelles sont portées par l'application
  avec un verrou consultatif PostgreSQL, car plusieurs processus ne doivent pas jouer la même tâche. Un courtier ou une file
  (Postgres, sans service payant) n'est ajouté que sur besoin mesuré et par ADR.
- **PDF** : openhtmltopdf + Batik (paie, heures supplémentaires) sont remplacés par un moteur HTML/CSS vers PDF gratuit et
  compatible avec le CSS paginé (éléments `running`, `@page`, `counter(pages)`) — **WeasyPrint** est le candidat, à valider au
  prototype sur le rapport de paie et celui des heures supplémentaires par comparaison d'images, car c'est le risque de fidélité
  le plus élevé de la migration. **Excel** : `openpyxl` (lecture/écriture) à la place d'Apache POI. **Courriel** : bibliothèque
  SMTP asynchrone.
- Les paquets système requis par le moteur PDF s'ajoutent au `Dockerfile` unique et sont comptés dans la taille d'image mesurée.

### 6. Contrat d'API, observabilité, tests, qualité

- **OpenAPI** : généré par FastAPI à partir des modèles Pydantic ; chemins, noms de champs, codes d'erreur et format des erreurs
  restent identiques à ceux de Spring pour chaque domaine basculé. Un test de contrat compare le document OpenAPI de Spring et celui de
  FastAPI domaine par domaine avant toute bascule (le frontend ne doit rien remarquer).
- **Observabilité** : OpenTelemetry (déjà en place côté IA) pour traces et métriques, journaux JSON, mêmes noms de métriques
  qu'aujourd'hui quand un tableau de bord ou une alerte les lit ; Phoenix pour les traces IA.
- **Tests** : `pytest`, `testcontainers` pour PostgreSQL réel (comme Testcontainers côté Java), `TestClient` avec
  `dependency_overrides` pour substituer identité et configuration (documenté), tests de parité de calcul, tests de contrat
  OpenAPI. Couverture : le seuil actuel est conservé (`coverage.py` à la place de JaCoCo).
- **Qualité et chaîne de livraison** : `ruff` (règles bandit incluses) et `pyright` à la place de Checkstyle ; OSV et CycloneDX
  équivalents Python ; mêmes portes de CI (`backend`, `full-stack`, `ia`, `performance-profile`) conservées sous leurs noms.

### 7. Stratégie de bascule : une branche de travail, une seule PR, une seule mise en production (détail dans KAN-46)

Décision du propriétaire (2026-11-03), **amendée le même jour** : le travail vit sur **une branche de travail unique** (commits
locaux, rien poussé) jusqu'à la fin de l'épopée, puis **une seule PR vers `main`** avec le code, la documentation, les
conventions et les skills à jour. Il est conduit sans compromis sur les bonnes pratiques et les patrons de conception, sans
rien perdre de l'existant Spring. La branche d'intégration `migration/fastapi` avec une PR par ticket, prévue d'abord, est
abandonnée : sa seule valeur (relecture et CI par ticket) est reprise par les contrôles locaux de `pre-commit` (KAN-209) et
par un commit par ticket ; la CI ne tourne qu'à la PR finale, sur demande du propriétaire.

- **Branche** : une branche de travail locale unique, un commit par ticket (KAN-45 à KAN-50 et leurs enfants), message au
  format du dépôt. Aucun push avant la fin ; aucune extension de la CI n'est nécessaire.
- **Production** : reste sur Spring, donc sur `main`, jusqu'à la mise en production unique de la fin. Aucun domaine n'est servi par
  FastAPI en production avant la bascule ; la coexistence des deux backends n'existe que dans la CI et l'environnement d'essai de
  la branche, où chaque domaine est comparé à Spring sur les mêmes données.
- **Gel et rapprochement** : `main` ne reçoit pendant ce temps que des correctifs et les évolutions déjà décidées ; chaque
  changement de comportement d'un domaine sur `main` crée un ticket de report dans la branche. `main` est fusionné dans la
  branche à chaque fin de domaine (jamais l'inverse avant la bascule), pour que l'écart reste lisible. Comme la branche
  reste locale, ce rapprochement est un `git merge main` sans conséquence pour les autres.
- **Rien d'oublié** : l'inventaire exhaustif de KAN-45 (routes, permissions, outils MCP, tâches planifiées, clés de
  configuration, métriques, actions d'audit, messages d'erreur, tests, documents) devient la liste de contrôle de sortie ; chaque
  ligne porte sa preuve de parité. La branche ne se fusionne que lorsque toutes les lignes sont cochées.
- **Ordre** : prototype sur `common` (KAN-47) → tranche transversale `common`, `auth`, `audit`, `parametre`, MCP (KAN-48) →
  `function`, `equipe`, `chantier`, `employee`, `heuresupp`, `paie` un par un (KAN-49) → retrait du code Spring (KAN-50). Les
  sujets des autres épopées écrits « côté Spring » attendent leur domaine (liens Jira posés le 2026-11-02).
- **Critère de fin de domaine** : tests du domaine reproduits et verts, parité de calcul prouvée, contrat OpenAPI identique,
  lecture et écriture de bout en bout sur une copie des données réelles, `full-stack` vert.
- **Bascule finale** : sauvegarde vérifiée (`conventions/backup.md`), répétition générale sur une copie de la production,
  PR unique et fusion dans `main`, déploiement, estampillage Alembic. Avant la fusion, le compose et le `.env` de
  production sont annoncés au propriétaire (règle d'`AGENTS.md`). **Retour arrière** : redéploiement de l'étiquette Spring
  précédente ; la base reste compatible tant que les révisions Alembic de la bascule sont rétro-compatibles (exigé en revue),
  sinon restauration de la sauvegarde.
- **Coût assumé** : une branche longue et non poussée retarde la détection des défauts d'intégration, n'a aucune sauvegarde
  distante et double certains correctifs ; on le borne par le rapprochement régulier, le gel, les contrôles locaux à chaque
  commit et une sauvegarde locale du dépôt (`git bundle`) à chaque fin de domaine. Si cela devient ingérable, la bascule par domaine
  derrière un proxy (variante écartée ci-dessous) reste le repli.

## Options écartées

- **Rester sur Spring et garder le service IA séparé** : conserve deux écosystèmes, un saut réseau et la duplication des contrats
  d'outils ; écarté par décision du propriétaire (Q15).
- **Bascule domaine par domaine en production derrière un proxy** : réduit le risque de chaque mise en production mais impose deux
  backends et deux outils de migration sur le même schéma pendant des mois ; écartée par le propriétaire au profit de la branche
  d'intégration (§ 7), gardée comme repli.
- **Réécriture sans parité exécutable** : régression de paie non détectable ; écartée, la parité par domaine est obligatoire.
- **Deux conteneurs FastAPI (API + IA)** : écarté par décision du propriétaire (2026-11-02), sous réserve des mesures ci-dessous.
- **Django ou Litestar** : le service IA est déjà en FastAPI/Pydantic, ses outils et AG-UI s'y branchent ; un autre framework
  ajouterait un troisième écosystème sans gain mesuré.
- **SQLModel** : couche mince sur SQLAlchemy et Pydantic, mais moins éprouvée pour le verrouillage, l'audit et les contraintes
  SQL fines dont ce projet dépend ; SQLAlchemy seul est retenu.
- **Garder Flyway après la migration** : outil Java dans une image Python ; écarté, voir § 3.

## Mesures obligatoires (avant et après, consignées dans Jira)

Latence IA bout en bout (p50/p95, parcours de référence du banc), nombre de conteneurs, mémoire au repos et sous charge, temps de
démarrage, taille d'image, temps de génération du PDF de paie (jeu de référence) et résultats du profil de performance de la CI.
Si l'hypothèse « un seul conteneur est meilleur » n'est pas confirmée, on le consigne et on rouvre la décision de forme (§ 1).

## Conséquences

- **Documents à remplacer** (KAN-44) : `conventions/jpa.md`, `database.md`, `architecture.md`, `security.md`, `testing.md`,
  `swagger.md`, `metrics.md`, `mcp.md`, `audit.md`, `logging.md`, `performance.md`, `configuration.md`, `deployment.md`,
  `AGENTS.md`, `docs/architecture.md`, `docs/testing.md`, `docs/developpement-local.md`, `docs/ia/decisions.md`, plus les
  README de domaine à mesure des bascules.
- Le frontend n'est pas modifié par E2 : il consomme le même contrat OpenAPI avant et après (E3 le recompose en Next.js).
- Les tâches des autres épopées écrites pour Spring sont rattachées à leur domaine par des liens Jira (E7.3, E7.4, E13.4, E14.3,
  E14.4) ; E4.12 (Pointage) naît côté FastAPI après le prototype.
- Risques suivis : fidélité des PDF (comparaison d'images), parité des arrondis monétaires (tests de parité), perte
  d'horodatage ou de colonne dans l'audit (comparaison des lignes `*_aud` produites par les deux backends sur un même scénario),
  rupture de session au passage à RS256 (planifiée), dérive de schéma à la remise de Flyway à Alembic (contrôle d'autogénération).

## Règles supprimées ou changées (conventions du profil Python, KAN-44)

Chaque règle du profil Java qui disparaît ou change figure ici avec sa raison ; toute règle absente de ce tableau est **conservée**
(principes, sécurité, audit, tests par couches, mesure avant optimisation, accord du propriétaire pour toute suppression). Le détail
vit dans les conventions `backend-python` du site de documentation (page « Règles supprimées ou changées »).

| Règle Java/Spring | Devenir | Raison |
| --- | --- | --- |
| Injection par constructeur | `Depends()` avec `Annotated` | Mécanisme d'injection de FastAPI |
| `@Entity` JPA / Hibernate, Spring Data, `Specification` | SQLAlchemy 2.x (`Mapped`), `repository.py` à `select()` explicites, `criteria.py` | ORM Python ; « entité jamais exposée par l'API » conservée |
| MapStruct | Fonctions explicites ou `from_attributes` | Pas de génération de code |
| `@Transactional`, interdiction d'Open Session in View | Frontière transactionnelle explicite (`session.begin()`), `expire_on_commit=False`, `selectinload` | Pas de chargement paresseux hors `await` ; une opération métier = une transaction |
| Hibernate Envers | Écouteur `before_flush`/`after_flush`, tables `*_aud` conservées | Envers n'existe pas en Python |
| `@Version` | `version_id_col`, `StaleDataError` → 409 | Même sémantique, même code HTTP |
| Flyway ; migration au démarrage | Alembic (`stamp` au niveau V44, SQL écrit à la main) ; étape de déploiement dédiée, jamais dans le `lifespan` | Voir § 3 |
| `@RestControllerAdvice`, Springdoc | Gestionnaires d'exceptions de l'application ; OpenAPI généré par FastAPI | Contrat externe identique, vérifié par test de parité |
| JWT HS256 et bibliothèque JWT Java | RS256 pour tous les jetons, PyJWT, `pwdlib` avec `verify_and_update` | Voir § 4 |
| `EndpointSecurityTest`, ArchUnit | Test de couverture des routes par introspection, import-linter | Mêmes garanties |
| Checkstyle, PMD, JaCoCo | Ruff, pyright strict, coverage.py (seuils 90 % domaine / 80 % global repris) | Outils Python équivalents |
| `@MockitoBean`, `MockMvc`, JUnit | `dependency_overrides`, `TestClient`, pytest avec AnyIO | Mécanismes de test de FastAPI |
| Profils Spring, Logback, Micrometer | Jeu de variables par environnement (`pydantic-settings`, `extra="forbid"`), `logging` JSON, OpenTelemetry (noms de métriques conservés) | Voir § 6 |
| Threads virtuels, pools Java | `async def` pour la base, `def` ou `run_in_threadpool` pour le bloquant | Modèle de concurrence de FastAPI |
| jsoup + openhtmltopdf, Apache POI | WeasyPrint (`URLFetcher` restreint), openpyxl + `defusedxml` | Voir § 5 |
| Spring AI (serveur MCP) | SDK Python MCP 2.x, monté dans FastAPI | Voir § 1 ; règles de sécurité du MCP conservées |
| Conventions Java | Supprimées une fois Spring retiré | Preuve de fin de migration |

Règles **ajoutées** : test de parité par domaine, test de contrat OpenAPI, règle `async def`/`def`, aucune migration dans le
`lifespan`, interdiction des écritures ORM en masse sur une entité auditée, et, pour l'IA, la sélection d'outils juste-à-temps
bornée et l'utilisation stricte de toutes les capacités de LangChain, LangGraph et Deep Agents (`AGENTS.md`, `conventions/agents-ia.md`).

## Points approuvés avec l'ADR (2026-11-03)

1. **RS256 pour tous les jetons** : acceptez-vous la déconnexion unique des utilisateurs au basculement du domaine `auth` ?
2. **Branche d'intégration `migration/fastapi`**, CI étendue, gel de `main` hors correctifs : amendé le 2026-11-03 par une
   branche de travail unique et une seule PR (§ 7), gel de `main` hors correctifs confirmé.
3. **Moteur PDF** : WeasyPrint comme candidat, avec repli documenté si la fidélité du rapport de paie n'est pas atteinte ?
4. **Hypothèse du conteneur unique** : accepté comme décision *provisoire*, rouverte si les mesures la contredisent ?
