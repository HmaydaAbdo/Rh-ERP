# Contrôle de conformité du backend (2026-10-11)

> Contrôle du backend contre les conventions de référence applicables (`conventions/*.md`).
> Méthode : lecture du code et de la configuration, puis règles exécutables (`ArchitectureConventionsTest`) pour que
> les écarts corrigés ne reviennent pas. Les écarts qui engagent un choix d'architecture ou de fonctionnement sont
> listés **sans être corrigés** : ils attendent une décision (voir « Écarts ouverts »).

---

## Conforme (vérifié)

| Sujet | Constat | Garde-fou |
|---|---|---|
| Couches | Un contrôleur n'atteint ni repository ni entité ; un mapper ne fait que convertir ; un repository n'appelle ni service ni contrôleur ; une entité ne dépend ni de l'API ni des services | `ArchitectureConventionsTest` |
| Frontières de domaines | Aucun domaine n'utilise le repository ou le service concret d'un autre : seule la façade `I<Domaine>Service` | `ArchitectureConventionsTest` |
| DTO | Tous des `record` | `ArchitectureConventionsTest` |
| Injection, journalisation | Injection par constructeur ; pas de `System.out` ni de `java.util.logging` ; logger `private static final … log`, jamais dans un contrôleur, un repository ou un mapper | `ArchitectureConventionsTest` |
| JPA | Toute entité déclare sa table ; aucune relation en `EAGER` | `ArchitectureConventionsTest` |
| Audit | Trois couches (Envers, journal d'actions, événements de sécurité) ; toute entité auditée ou exclue explicitement ; aucune écriture en masse | `AuditArchitectureTest` |
| RBAC | Chaque route déclare une permission ; refus, acceptation et table de référence vérifiés | `EndpointSecurityTest`, `JwtSecurityChainTest` |
| Sessions | Jeton d'accès court, jeton de rafraîchissement opaque à rotation et révocation de famille, cookie `httpOnly` | `AuthServiceTest` |
| Base | Flyway V1 → V15, deux comptes PostgreSQL (migration / application restreint), PostgreSQL 18 en CI | `PaieApplicationTests`, `AuditIntegriteTest` |
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
| C10 | **Chaîne d'approvisionnement Maven** (G8) : aucune analyse, aucun SBOM, aucune couverture. **L'analyse a révélé 26 vulnérabilités connues** (3 critiques, 15 hautes) : Tomcat 11.0.24 (contournement d'authentification DIGEST, contrôle d'accès et FORM), Jackson (dénis de service), jsoup 1.18.1, Batik 1.14 (SSRF, exécution de code), Xalan 2.7.2 | Versions relevées : Tomcat 11.0.26, Jackson 2.21.7 / 3.1.7, jsoup 1.23.2, Batik 1.19, Xalan retiré (devenu inutile). CI : SBOM CycloneDX, OSV-Scanner (échec si vulnérabilité), JaCoCo (87 % des lignes, 73 % des branches), Dependabot. Suite complète verte (284) |
| C11 | **Demande de réinitialisation synchrone** (G2) : l'envoi du courriel allongeait la réponse pour une adresse connue | `EmailService.envoyerLienReinitialisation` en `@Async` (`AsyncConfig`), échec journalisé sans être renvoyé ; `EmailServiceTest` |
| C12 | **Tests sur PostgreSQL** (G9) : conteneur de service en CI et base préparée à la main en local (partagée, donc exposée aux données réelles) | Testcontainers (`pgvector/pgvector:pg18`, un conteneur par exécution, démarré à la première classe `@SpringBootTest`) ; le service PostgreSQL et les variables `DB_*` disparaissent de la CI ; suite complète (287) verte sans aucune variable de base |
| C13 | **Création d'un utilisateur ou d'un rôle répondait `200`** (les autres domaines répondent `201`) | `POST /users` et `POST /roles` répondent `201 Created` (documenté dans Swagger) ; le frontend accepte tout `2xx` |

---

## Écarts ouverts — décision requise

Ils sont suivis dans [TODO.md](../../TODO.md).

| # | Gravité | Constat | Proposition / options |
|---|---|---|---|
| G3 | Moyenne | **Valeurs de fonctionnement en dur** : durée du jeton d'accès (15 min), du jeton de rafraîchissement (30 jours), du lien de réinitialisation (1 h), longueur minimale du mot de passe (10), tranche de l'analytique de paie (500). `conventions/configuration.md` demande qu'une valeur métier susceptible d'évoluer (délais, seuils, durées, tentatives) soit **réglable par un administrateur dans l'interface**, jamais dans le code ni dans `application.yml` | Nouveau chantier : table de paramètres, écran d'administration, permission dédiée, audit et documentation RBAC — c'est un choix d'architecture, donc à valider avant de le coder. Alternative : constater que ces cinq valeurs sont des paramètres techniques stables et les laisser (écart assumé) |
| G5 | Basse | `GET /users` et `GET /roles` renvoient la liste entière, sans pagination | **Écart assumé proposé** : routes réservées à `USER_MANAGE` / `ROLE_MANAGE`, quelques dizaines de lignes, et les sélecteurs de l'interface (rôles d'un compte) ont besoin de la liste complète ; paginer changerait le contrat et trois écrans sans gain de sécurité |
| G6 | Basse | **Extension `vector`** créée dès `V1` alors qu'aucune table ne l'utilise (`conventions/database.md` et `conventions/deployment.md` demandent de ne l'activer qu'à un besoin réel) | **Écart assumé proposé** : activation décidée par le propriétaire dans `V1` (déjà appliquée en production : la modifier casse la somme de contrôle Flyway) ; la retirer demanderait une `V16` `DROP EXTENSION` et modifierait la procédure de migration PG17 → PG18, qui contrôle la présence de pgvector |
| G10 | À vérifier | **Production** : confirmer qu'elle utilise bien les deux comptes PostgreSQL (migration / application) | Sur le serveur : `docker compose logs backend | grep "Intégrité de l'audit"` — « NON garantie » signifie un seul compte (voir [../deployment.md](../deployment.md), « Deux comptes PostgreSQL »). Aucune action sur la production sans sauvegarde et répétition |

---

## Suite

1. Décider G3, G5, G6 et vérifier G10 (G1, G2, G4, G7, G8 et G9 sont traités).
2. Migration de la production PostgreSQL 17 → 18 : voir [../deployment.md](../deployment.md) (répétition sur une sauvegarde avant tout).
