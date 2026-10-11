# Contrôle de conformité du backend (2026-10-11)

> Contrôle du backend contre les conventions ERP-RH (`conventions/*.md`) et le socle Staport épinglé (v0.1.1).
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

## Écarts corrigés dans ce lot

| # | Écart | Correction |
|---|---|---|
| C1 | **Énumération des comptes par le temps de réponse** : un identifiant inconnu ou un compte inactif était refusé sans hachage de mot de passe, donc plus vite qu'un mot de passe faux (conventions/security.md, « Principes ») | `AuthService.login` compare toujours le mot de passe (empreinte factice pour un identifiant inconnu, vérification avant le refus d'un compte inactif) ; `AuthServiceTest` le vérifie |
| C2 | **Adresse e-mail dans les journaux** : `EmailService` écrivait l'adresse du destinataire d'une réinitialisation (donnée personnelle, conventions/logging.md) | L'adresse n'est plus journalisée |
| C3 | **Documentation d'API incomplète** : les contrôleurs d'authentification, d'utilisateurs et de rôles n'avaient ni `@Tag` ni `@Operation` (conventions/swagger.md) | Annotations ajoutées (avec les réponses d'erreur utiles) ; la règle est verrouillée pour tous les contrôleurs |
| C4 | **Durée du jeton de rafraîchissement en deux endroits** (30 jours dans le service et dans le cookie) | Source unique : `IAuthService.REFRESH_TOKEN_TTL` |
| C5 | **Critères de recherche sans borne** : chaînes et listes d'identifiants de taille libre, corps non validé | `@Size` alignés sur les colonnes filtrées (listes : 500 identifiants au plus), `@Valid` sur tous les corps de critères, y compris celui de la suppression en groupe ; `EmployeeControllerTest` vérifie le `400` |
| C6 | Aucune règle exécutable pour les conventions d'architecture, de journalisation, de JPA et de documentation d'API | `ArchitectureConventionsTest` (14 règles) |
| C7 | **Aucune limite de débit** (G1) | `limit_req` dans nginx inner (`429`) : connexion 20/min, réinitialisation 5/min, session 120/min, `POST` coûteux 30/min, par adresse de client réel ; essayé sur un nginx réel. Convention ajoutée à `conventions/security.md`. Le verrouillage de compte reste possible plus tard |

---

## Écarts ouverts — décision requise

Ils sont suivis dans [TODO.md](../../TODO.md). Pour chacun : le constat, puis les options.

| # | Gravité | Constat | Options à trancher |
|---|---|---|---|
| G2 | Basse | **Demande de réinitialisation synchrone** : l'envoi du courriel allonge la réponse pour une adresse connue, ce qui la distingue d'une adresse inconnue | Envoi asynchrone après la réponse |
| G3 | Basse | **Valeurs de fonctionnement en dur** : durées des jetons, longueur du mot de passe, expressions cron, tranche de pas | Variables d'environnement (`conventions/configuration.md`) ou paramètres administrables en base |
| G4 | Moyenne | **Métriques** : Micrometer sans registre Prometheus alors que `/actuator/prometheus` est ouvert par la configuration de sécurité ; journaux en texte, pas en JSON ni asynchrones | Ajouter le registre et protéger la route, ou retirer la route ouverte ; format de journal JSON |
| G5 | Basse | **Listes non paginées** : `GET /users` et `GET /roles` ; statuts `201` des créations à aligner route par route | Pagination et statuts alignés (change le contrat avec le frontend) |
| G6 | Basse | **Extension `vector`** créée dès `V1` alors qu'aucune table ne l'utilise encore | La garder (socle Staport) ou la créer à la première table concernée |
| G7 | Moyenne | **Image Docker** : exécution non confinée à un utilisateur sans privilèges, images non épinglées par empreinte | Utilisateur dédié, empreinte de l'image de base |
| G8 | Moyenne | **Chaîne d'approvisionnement Maven** : pas d'analyse de vulnérabilités, de SBOM ni de couverture mesurée (le frontend a déjà l'audit, les licences et le SBOM) | Plugin d'analyse (OWASP Dependency-Check ou équivalent), SBOM CycloneDX, JaCoCo, alertes Dependabot |
| G9 | Basse | **Tests sur PostgreSQL** : la CI utilise un conteneur de service, pas Testcontainers | Garder le service CI ou passer à Testcontainers (exécution locale sans base préparée) |
| G10 | À vérifier | **Production** : confirmer que le déploiement utilise bien les deux comptes PostgreSQL (migration / application) comme la CI et `afterMigrate.sql` | Vérification côté serveur, à faire avec le propriétaire (aucune action sur la production sans sauvegarde et répétition) |

---

## Suite

1. Décider G1 à G10 (ordre proposé : G1, G4, G8, G7, puis le reste).
2. Migration de la production PostgreSQL 17 → 18 : voir [../deployment.md](../deployment.md) (répétition sur une sauvegarde avant tout).
3. Mettre à jour l'épinglage du socle Staport quand une version plus récente que v0.1.1 paraît.
