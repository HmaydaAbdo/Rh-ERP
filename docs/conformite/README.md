# Contrôle de conformité ERP-RH (2026-10-11)

> Contrôle initial du backend contre les conventions de référence applicables (`conventions/*.md`).
> Méthode : lecture du code et de la configuration, puis règles exécutables (`ArchitectureConventionsTest`) pour que
> les écarts corrigés ne reviennent pas. Les écarts qui engagent un choix d'architecture ou de fonctionnement sont
> listés **sans être corrigés** : ils attendent une décision (voir « Écarts ouverts »).

---

La matrice exhaustive, qui étend ce contrôle au frontend, aux tests, à Docker, à la CI et à
l'exploitation, est dans [matrice.md](matrice.md). Elle constitue le registre courant de l'audit ;
les tableaux ci-dessous décrivent uniquement les vérifications backend déjà documentées.

---

## Conforme (vérifié)

| Sujet | Constat | Garde-fou |
|---|---|---|
| Couches | Un contrôleur n'atteint ni repository ni entité ; un mapper ne fait que convertir ; un repository n'appelle ni service ni contrôleur ; une entité ne dépend ni de l'API ni des services | `ArchitectureConventionsTest` |
| Frontières de domaines | Aucun domaine n'utilise le repository ou le service concret d'un autre : seule la façade `I<Domaine>Service` | `ArchitectureConventionsTest` |
| DTO | Tous des `record` | `ArchitectureConventionsTest` |
| Injection, journalisation | Injection par constructeur ; pas de `System.out` ni de `java.util.logging` ; logger `private static final … log`, jamais dans un contrôleur, un repository ou un mapper | `ArchitectureConventionsTest` |
| JPA | Toute entité déclare sa table ; aucune relation en `EAGER` | `ArchitectureConventionsTest` |
| Audit | Trois couches (Envers, journal d'actions, événements de sécurité) ; couverture des écritures, atomicité, permissions dédiées, protection append-only et chaîne d'intégrité | [`audit-2026-10-12.md`](audit-2026-10-12.md), `Audit*Test` |
| RBAC | Chaque route déclare une permission ; refus, acceptation et table de référence vérifiés | `EndpointSecurityTest`, `JwtSecurityChainTest` |
| Sessions | Jeton d'accès court, jeton de rafraîchissement opaque à rotation et révocation de famille, cookie `httpOnly` | `AuthServiceTest` |
| Base | Flyway V1 → V21, deux comptes PostgreSQL (migration / application restreint), PostgreSQL 18 en CI | `PaieApplicationTests`, `AuditIntegriteTest` |
| Documentation d'API | Swagger éteint par défaut ; ses routes exigent un jeton quand il est éteint | `DocumentationApiSecurityTest` |

---

## Écarts corrigés (2026-10-11)

| # | Écart | Correction |
|---|---|---|
| C1 | **Énumération des comptes par le temps de réponse** : un identifiant inconnu ou un compte inactif était refusé sans hachage de mot de passe, donc plus vite qu'un mot de passe faux (conventions/security.md, « Principes ») | `AuthService.login` compare toujours le mot de passe (empreinte factice pour un identifiant inconnu, vérification avant le refus d'un compte inactif) ; `AuthServiceTest` le vérifie |
| C2 | **Adresse e-mail dans les journaux** : `EmailService` écrivait l'adresse du destinataire d'une réinitialisation (donnée personnelle, conventions/logging.md) | L'adresse n'est plus journalisée |
| C3 | **Documentation d'API incomplète** : les contrôleurs d'authentification, d'utilisateurs et de rôles n'avaient ni `@Tag` ni `@Operation` (conventions/swagger.md) | Annotations ajoutées (avec les réponses d'erreur utiles) ; la règle est verrouillée pour tous les contrôleurs |
| C4 | **Durée du jeton de rafraîchissement en deux endroits** (30 jours dans le service et dans le cookie) | Source unique : `IAuthService.REFRESH_TOKEN_TTL` |
| C5 | **Critères de recherche sans borne** : chaînes et listes d'identifiants de taille libre, corps non validé | `@Size` alignés sur les colonnes filtrées (listes : 500 identifiants au plus), `@Valid` sur tous les corps de critères, y compris celui de la suppression en groupe ; `EmployeeControllerTest` vérifie le `400` |
| C6 | Aucune règle exécutable pour les conventions d'architecture, de journalisation, de JPA et de documentation d'API | `ArchitectureConventionsTest` (14 règles) |
| C7 | **Aucune limite de débit** (G1) | `limit_req` dans nginx inner (`429`) : connexion 20/min, réinitialisation 5/min, session 120/min, `POST` coûteux 30/min, par adresse de client réel ; essayé sur un nginx réel. Convention ajoutée à `conventions/security.md`. Le verrouillage de compte reste possible plus tard |
| C8 | **Métriques et journaux** (G4) : `/actuator/prometheus` était ouvert par la sécurité mais n'existait pas ; journaux en texte | Registre Prometheus + exposition de `health` et `prometheus` seulement (tag `application`) ; journaux JSON asynchrones en production (`LOGGING_FORMAT=json`, `logstash-logback-encoder`) ; `SupervisionTest` |
| C9 | **Images Docker** (G7) : exécution en root, images de base non épinglées, healthcheck frontend fragile | Backend sous un compte dédié, frontend sur `nginx-unprivileged` (8080), bases épinglées par empreinte ; essayé : les deux images construites et lancées ensemble (non-root, santé, JSON, `429`) |
| C10 | **Chaîne d'approvisionnement Maven** (G8) : aucune analyse, aucun SBOM, aucune couverture. **L'analyse a révélé 26 vulnérabilités connues** (3 critiques, 15 hautes) : Tomcat 11.0.24 (contournement d'authentification DIGEST, contrôle d'accès et FORM), Jackson (dénis de service), jsoup 1.18.1, Batik 1.14 (SSRF, exécution de code), Xalan 2.7.2 | Versions relevées : Tomcat 11.0.26, Jackson 2.21.7 / 3.1.7, jsoup 1.23.2, Batik 1.19, Xalan retiré (devenu inutile). CI : SBOM CycloneDX, OSV-Scanner (échec si vulnérabilité), JaCoCo (87 % des lignes, 73 % des branches), Dependabot. Suite backend documentée : 304 tests |
| C11 | **Demande de réinitialisation synchrone** (G2) : l'envoi du courriel allongeait la réponse pour une adresse connue | `EmailService.envoyerLienReinitialisation` en `@Async` (`AsyncConfig`), échec journalisé sans être renvoyé ; `EmailServiceTest` |
| C12 | **Tests sur PostgreSQL** (G9) : conteneur de service en CI et base préparée à la main en local (partagée, donc exposée aux données réelles) | Testcontainers (`pgvector/pgvector:0.8.7-pg18`, un conteneur par exécution, démarré à la première classe `@SpringBootTest`) ; le service PostgreSQL et les variables `DB_*` disparaissent de la CI ; suite backend documentée : 304 tests |
| C13 | **Création d'un utilisateur ou d'un rôle répondait `200`** (les autres domaines répondent `201`) | `POST /users` et `POST /roles` répondent `201 Created` (documenté dans Swagger) ; le frontend accepte tout `2xx` |
| C14 | **G3 — Paramètres de fonctionnement codés en dur** | Migration `V16`, catalogue typé et borné dans `CleParametre`, écran d'administration, permissions dédiées et journalisation des changements ; tests backend et frontend dans le module Paramètres |
| C15 | **G5 — Listes utilisateurs et rôles non paginées** | Les listes passent par `POST /users/search` et `/roles/search`, avec pagination serveur et permissions `USER_MANAGE` / `ROLE_MANAGE` ; les routes de liste entière n'existent plus |
| C16 | **G6 — Extension `vector` activée sans usage actuel** | Exception confirmée le 2026-10-11 : le propriétaire souhaite conserver pgvector pour de futurs embeddings ; aucune migration de suppression prévue |
| C17 | **G11 — CORS trop permissif** : toutes les origines étaient réfléchies avec des credentials | `CORS_ALLOWED_ORIGINS` est validé au démarrage et appliqué comme liste d'origines explicites ; tests de pré-vol autorisé/refusé et [ADR 0003](../adr/0003-cors-origines-explicites.md) |

---

## Écarts ouverts — décision requise

Ils sont suivis dans [TODO.md](../../TODO.md).

| # | Gravité | Constat | Proposition / options |
|---|---|---|---|
| G10 | À vérifier en production | Le dépôt prépare le compte applicatif distinct, la chaîne locale d'intégrité et pgAudit. Le serveur est encore en PostgreSQL 17 ; ces contrôles seront faits pendant la migration vers PostgreSQL 18. | Après accès SSH, vérifier le message d'intégrité, `shared_preload_libraries`, l'extension et les journaux pgAudit selon [../deployment.md](../deployment.md). Aucun accès SSH disponible dans cette session |

---

## Suite

1. G3, G5 et G11 sont corrigés (C14, C15 et C17). G6 est conservé par décision du propriétaire (C16) ; vérifier G10 (G1, G2, G4, G7, G8 et G9 sont traités).
