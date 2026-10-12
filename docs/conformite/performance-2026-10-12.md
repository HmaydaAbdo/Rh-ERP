# Contrôle de conformité — Performance (2026-10-12)

## Résultat

**Contrôle exhaustif effectué ; conformité locale du profil mesuré.** Le propriétaire a validé les
objectifs et les valeurs SMTP. Le contrôle a corrigé la pagination de l'historique Envers, aligné la
limite Nginx sur Spring, ajouté des délais proxy aux routes lourdes et borné l'envoi SMTP. Le test
renforcé a passé les seuils des recherches, de l'import, de l'Excel et du PDF. La conformité
opérationnelle de production reste à confirmer sur l'hôte, avec le proxy public et les services
externes réels.

## Périmètre contrôlé

| Exigence | État observé | Preuve / limite |
|---|---|---|
| Collections HTTP bornées | Conforme pour les recherches paginées : taille maximale globale 200, taille Spring par défaut 20 ; les colonnes des tableaux Angular déclarent les propriétés triables. | `application.yml`, contrôleurs, colonnes des tableaux et `PageLoader` (pages d'import de 200). Les recherches Utilisateurs/Rôles ont aussi un tri par défaut. |
| Historique Envers | Corrigé : total calculé en base, page demandée et une révision supplémentaire chargées seulement ; diff correct à la frontière entre pages. | `EnversDiffService.historique`; `AuditConsultationTest` : 13 tests PostgreSQL réussis. |
| Imports et corps HTTP | Référentiels chargés avant les boucles ; limite Spring 20 Mo alignée avec Nginx inner. Connexion proxy 5 s et délais d'envoi/lecture 75 s sur les routes lourdes. | `docs/imports.md`, README domaines, `application.yml`, `frontend/nginx.conf`. `nginx -t` réussi avec l'image Nginx épinglée, le fichier principal et `proxy_params.conf`. |
| Frontend | Routes métier lazy-loaded ; budgets Angular initiaux 800 Ko avertissement / 1 Mo erreur, styles 8/16 Ko. | `frontend/src/app`, `frontend/angular.json`. Pas de mesure navigateur ou HTTP de bout en bout dans ce profil. |
| Exports et opérations de masse | Recherches paginées ; PDF/Excel et suppression/restauration de groupe traitent le périmètre complet imposé par leur contrat. | Mesure d'un mois synthétique de 1 000 bulletins ci-dessous ; aucun plafond métier de période n'a été inventé. |
| ERP et SMTP | ERP : connexion 5 s, lecture 30 s, pas de retry automatique. SMTP : connexion 5 s, lecture 3 s, écriture 5 s ; pool 2–4, file 100, keep-alive 30 s, rejet immédiat. | `application.yml`, `MailExecutorProperties`, `AsyncConfig`, `EmailService`. `AsyncConfigTest` sature effectivement 4 travailleurs + 100 places ; `AuthServiceTest` vérifie le maintien de la réponse générique. Le fournisseur SMTP réel n'est pas testé. |
| Base et index | Index métier, période de paie et audit ; batch JDBC 50 ; `open-in-view=false`. | Migrations et `application.yml`. Le plan PostgreSQL représentatif utilise `idx_paie_periode` et est mesuré ci-dessous ; aucun nouvel index n'est justifié par cette mesure. |

## Profil approuvé

Profil de test local, pas une capacité garantie en production.

| Élément | Cible approuvée |
|---|---|
| Jeu synthétique | 1 000 employés et bulletins par période, 60 périodes (60 000 bulletins) |
| Charge de lecture | 20 sessions, environ 10 recherches paginées par seconde |
| Charge lourde | 3 opérations simultanées (import, Excel, PDF), chacune sur 1 000 lignes |
| Recherches | p95 ≤ 750 ms ; p99 ≤ 1,5 s |
| Import | p95 ≤ 10 s |
| Excel / PDF | p95 ≤ 30 s ; p99 ≤ 60 s |
| Erreurs techniques | < 1 %, hors rejets fonctionnels et `429` intentionnels |
| SMTP | connexion 5 s, lecture 3 s, écriture 5 s ; pool 2–4, file 100, keep-alive 30 s |
| File SMTP pleine | rejet immédiat ; réponse HTTP générique ; log sans adresse/jeton ; pas d'exécution dans le thread HTTP |

Les délais SMTP reprennent les exemples de la [documentation officielle Spring Boot sur le
courrier](https://docs.spring.io/spring-boot/reference/io/email.html) ; les options du pool suivent
la [documentation officielle sur l'exécution des tâches](https://docs.spring.io/spring-boot/reference/features/task-execution-and-scheduling.html).
La file SMTP est en mémoire : un arrêt forcé peut perdre les envois en attente ; une file persistante
demanderait une décision d'architecture distincte.

## Mesure reproductible

Le test opt-in `backend/src/test/java/staport/rh/paie/performance/PerformanceProfileTest.java` crée
60 000 bulletins synthétiques dans PostgreSQL 18.6/Testcontainers, exécute `ANALYZE`, lance 600
recherches à 10 req/s et mesure 20 imports, 20 exports Excel et 20 rapports PDF avec trois tâches
lourdes en parallèle. Le classeur d'import est préparé avant le chronométrage. Le test mesure les
services Spring et PostgreSQL ; il n'inclut pas le réseau HTTP, la sérialisation JSON ni le navigateur.
Les données métier synthétiques sont supprimées à la fin.

Commande exécutée depuis `backend/` avec `CORS_ALLOWED_ORIGINS=http://localhost:4200` :

```powershell
.\mvnw.cmd -B -ntp '-Dperformance.profile=true' '-Dtest=PerformanceProfileTest,AsyncConfigTest' test
```

Environnement : Java 21.0.9, Spring Boot 4.1.1, PostgreSQL 18.6, Docker Desktop 29.7.2. **BUILD
SUCCESS, 5 tests, 0 échec, 0 erreur.** Résultats du profil à 20 échantillons ; le p99 empirique sur
20 valeurs correspond au maximum de l'échantillon :

| Mesure | Résultat | Cible | État |
|---|---:|---:|---|
| Recherches (600) | p95 34 ms ; p99 51 ms | 750 ms ; 1 500 ms | Conforme |
| Import (1 000 lignes) | p95 5 484 ms | 10 000 ms | Conforme |
| Excel (1 000 lignes) | p95 5 676 ms ; p99 9 865 ms | 30 000 ms ; 60 000 ms | Conforme |
| PDF (1 000 lignes) | p95 6 451 ms ; p99 14 719 ms | 30 000 ms ; 60 000 ms | Conforme |
| Erreurs du scénario | 0 recherche échouée ; aucune opération lourde en échec | < 1 % | Conforme |
| Ressources échantillonnées | heap 826 MiB ; 11 connexions PostgreSQL ; 61 threads JVM ; CPU processus max 50,0 % | Aucun plafond accepté | Observées seulement |

Plan conservé par `EXPLAIN (ANALYZE, BUFFERS)` après `ANALYZE` : index `idx_paie_periode`, 20 lignes
lues en 0,131 ms (63 buffers partagés en cache). Le premier essai exploratoire à 5 échantillons avait
chronométré la génération du classeur de test et affiché 12,1 s pour l'import ; le protocole corrigé
prépare le fichier avant la mesure. Il s'agit d'une preuve locale indicative, pas d'une garantie de
capacité en production.

## Vérifications encore hors de ce profil

Le profil n'exerce pas les routes via HTTP/nginx outer et ne teste pas un fournisseur SMTP réel ou
des dépendances ralenties/indisponibles. Aucun test frontend ou CI n'a été exécuté pour ce contrôle.
Pour clore la validation d'exploitation, rejouer le profil sur un hôte représentatif, mesurer HTTP
de bout en bout et vérifier les délais de réponse face à PostgreSQL, ERP et SMTP lents. Les tests
locaux ne remplacent pas cette validation.
