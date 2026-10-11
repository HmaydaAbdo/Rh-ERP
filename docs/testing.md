# Tests

> Ce qui est testé, comment lancer les tests, et les règles à suivre en écrivant un test. Les tests
> sont exécutés par la CI à chaque push et chaque pull request (`.github/workflows/ci.yml`) : un test qui
> échoue empêche la publication des images.

La règle normative est [`conventions/testing.md`](../conventions/testing.md) : elle rend les tests obligatoires
pour chaque domaine, changement transversal et parcours full stack. Ce document décrit les commandes et l'état
actuel des tests ERP-RH ; la convention décrit le niveau de preuve attendu.

---

## Lancer les tests

```bash
# Backend — Docker doit tourner : les tests d'intégration démarrent leur propre PostgreSQL jetable (Testcontainers) et ne
# touchent jamais la base de développement. Les autres variables (JWT_SECRET, SMTP_*…) viennent de backend/.env.
cd backend
./mvnw test

# Frontend
cd frontend
npm test                                      # unités et composants : Vitest dans Chromium (CHROME_BIN si Chrome n'est pas détecté)
npm run e2e                                   # parcours E2E Playwright (API simulée) avec axe
npm run audit:deps && npm run audit:licences  # chaîne d'approvisionnement
npx ng build --configuration production      # vérifie que le bundle de production compile
```

Les tests d'intégration démarrent eux-mêmes un PostgreSQL 18 + pgvector jetable avec **Testcontainers** (`staport.rh.support.PostgresPartage`, une seule fois pour toute la JVM, à la première classe `@SpringBootTest`) : **Docker doit tourner**, mais aucune base ni variable `DB_*` n'est à préparer, en local comme en CI. La CI utilise des variables d'environnement factices
(`JWT_SECRET` de test, etc.) et installe une police système, nécessaire au rendu des graphiques SVG du rapport en
environnement sans écran.

Le backend mesure sa couverture avec JaCoCo : `./mvnw test` écrit le rapport dans `backend/target/site/jacoco/index.html` (2026-10-11 : 87 % des lignes, 73 % des branches ; la CI le conserve comme artefact). La CI génère aussi le SBOM et analyse les dépendances (voir [deployment.md](deployment.md)).

---

## Backend (304 tests)

Dernière validation locale propre : 304 tests réussis, sans échec ni erreur, sous Java 21 et
PostgreSQL 18.6 + pgvector 0.8.7, le 2026-10-11. Cette validation utilise une base jetable séparée
des données migrées.

JUnit 5, Mockito, AssertJ, ArchUnit. La plupart des tests sont **unitaires** : le service est testé avec ses dépendances
simulées, sans base de données. `PaieApplicationTests` et **les tests d'intégration de l'audit** démarrent l'application
complète sur un vrai PostgreSQL 18 + pgvector (Testcontainers ; les instantanés Envers, les transactions et les droits ne se simulent pas) ; ils filtrent
toujours par identifiant, jamais par comptage global, car le conteneur est partagé par toutes les classes de test.

| Zone | Classes de test | Ce qu'elles vérifient |
|---|---|---|
| Démarrage | `PaieApplicationTests` | L'application démarre sur une **base vide** : toute la chaîne de migrations V1 → V16 est rejouée et validée contre les entités (`ddl-auto: validate`) |
| Sécurité des endpoints | `EndpointSecurityTest` | Découvre automatiquement tous les `@RestController` (sauf `AuthController`) : chaque endpoint déclare une permission, la **refuse** sans elle, l'**accepte** avec elle, refuse une autre permission du même domaine, et correspond à la **table de référence** (45 endpoints) |
| Chaîne JWT | `JwtSecurityChainTest` | De vrais jetons signés : `401` sans jeton, avec un jeton invalide ou signé avec un autre secret ; `403` sans la permission, même avec un rôle d'administrateur ; `200` avec ; une page est sérialisée par un DTO stable (`content` + `page`) ; une requête mal formée est un `400`, pas un `500` |
| Documentation d'API | `DocumentationApiSecurityTest`, `DocumentationApiAllumeeSecurityTest` | Swagger éteint (défaut, production) : ses routes exigent un jeton (`401`) ; allumé (développement) : publiques, le reste de l'API reste protégé |
| Conventions d'architecture | `ArchitectureConventionsTest` | 14 règles ArchUnit sur `staport.rh` : un contrôleur n'atteint ni repository ni entité ; mapper et repository sans logique ; entités indépendantes de l'API ; DTO en `record` ; frontières entre domaines (façade seulement) ; injection par constructeur ; pas de sortie standard ; logger `log` privé statique final, absent des contrôleurs ; table explicite et aucune relation `EAGER` ; `@Tag` sur chaque contrôleur et `@Operation` sur chaque route |
| Permissions effectives | `EffectivePermissionResolverTest` | Union des rôles moins les refus individuels |
| Audit — garde-fous | `AuditArchitectureTest` | Toute entité est auditée ou explicitement exclue ; toute méthode d'écriture d'un service porte `@AuditableAction` ou une exception justifiée ; aucune écriture en masse (`deleteAllInBatch`, `@Modifying`, `executeUpdate`, `JdbcTemplate.update`) ; les actions déclarent type et entité |
| Audit — socle | `AuditRevisionTest` | Chaque écriture produit une révision au bon nom et à la bonne origine ; sans changement ou changement de mot de passe seul : aucune révision ; suppression : contenu conservé ; annulation : rien ; origine `INCONNUE` visible ; état initial ; administrateur du démarrage |
| Audit — opérations | `AuditOperationTest`, `AuditImportTest`, `AuditSynchronisationTest`, `AuditAccesTest` | Entrée liée à sa révision, dans la même transaction (annulée avec elle) ; échec tracé à part ; violation de contrainte traduite comme avant ; suppression en groupe bulletin par bulletin (1 000 lignes) ; rôle attribué ou `SYSTEM_ADMIN` non supprimable ; import réussi (empreinte, action imbriquée) et rejeté ; synchronisation planifiée ou manuelle ; exports |
| Audit — sécurité | `AuditSecurityEventsTest`, `AuditDefaillanceTest`, `AuditIntegriteTest`, `AuditMigrationGabaritTest` | Chaque événement de sécurité sans donnée personnelle (identifiant inconnu, adresse saisie, mot de passe) ; **désactiver un compte ou réinitialiser son mot de passe (administrateur) coupe ses sessions**, modifier un compte sans le désactiver les laisse ; `403` de contrôleur et de chaîne de filtres, `401` non journalisé, `X-Request-Id` ; panne d'audit (fermé pour les données, ouvert pour la sécurité) ; **application démarrée avec le compte restreint** : fonctionne, et `UPDATE`/`DELETE`/`TRUNCATE`/`ALTER` sur l'audit refusés ; gabarit de migration auditée |
| Audit — migrations de données | `AuditMigrationPermissionTest` | `V15` (permission `PAIE_PURGE`) : attribution aux rôles de départ, révision `MIGRATION`, lignes d'audit des permissions, rôles et liaisons, entrée de journal |
| Audit — consultation | `AuditConsultationTest` | Différences champ par champ (ajout, modification, suppression, relations `id — libellé`, droits ajoutés/retirés, aucun mot de passe), pagination, historique, recherche (jokers neutralisés), permission `AUDIT_READ`, aucune route d'écriture |
| Rôles | `RoleAdministrationProtegeeTest` | `SYSTEM_ADMIN` ni supprimé, ni renommé, ni privé d'une permission (description modifiable) ; les autres rôles libres ; `protege` dans la réponse |
| Mots de passe | `PolitiqueMotDePasseTest` | Longueur, lettre, chiffre, différent de l'identifiant ; message sans la valeur saisie |
| Recherches | `MotifRechercheTest`, `PaieRechercheJokersTest` | Jokers `%` et `_` échappés ; dans la liste (Specification) **et** dans les agrégats (JPQL) de la paie, nom et CIN |
| Authentification | `AuthServiceTest` | Connexion (identifiants invalides, compte inactif ou inconnu, seuil de 5 échecs/15 min, blocage de 15 min, expiration de la fenêtre, remise à zéro après réussite), rotation, **renouvellement refusé pour un compte désactivé**, `revoquerSessions`, **réutilisation d'un jeton = révocation de la famille**, jeton expiré ou inconnu, déconnexion, mot de passe oublié (sans révéler l'existence d'un compte) et réinitialisation |
| Fonction | `FunctionServiceTest`, `FunctionImportServiceTest` | CRUD, doublons, suppression bloquée ; import atomique |
| Chantier | `ChantierServiceTest`, `ChantierSyncServiceTest`, `ChantierSyncTransactionalOperationsTest` | création et code en double ; synchronisation : création des absents, **jamais de modification** d'un existant, lignes sans code ignorées, isolation des échecs par ligne |
| Équipe | `EquipeServiceTest` | Normalisation du code, doublons, suppression bloquée |
| Employé | `EmployeeServiceTest`, `EmployeeControllerTest`, `EmployeeImportServiceTest`, `EmployeeSuppressionTest` | CRUD et références ; contrôleur ; import (CIN existant rejeté, un seul motif par ligne, atomicité) ; suppression : `409` explicite avec un bulletin ou un compte lié (employé conservé), `204` sans dépendant |
| Paie | `PaieServiceTest`, `PaieAnalytiqueServiceTest`, `PaieImportServiceTest`, `PaieExportServiceTest` | CRUD, bulletin en double ; masse des équipes d'un chantier ; suppression en groupe (nombre confirmé identique, refus et rien supprimé sinon, mois obligatoire, groupe vide) ; import (bulletin existant rejeté, création des fonctions manquantes, équipe) ; analytique (coût moyen, mois précédent absent sans bulletin, filtres vides ignorés, nom et CIN en motifs sans casse, tranches égales à dernière ouverte, nom du chantier, tout l'historique d'évolution sans fenêtre, tous les chantiers et toutes les fonctions sans plafond) ; `FiltresPaieTest` (mêmes règles de filtre que la liste) ; export Excel (feuille globale et par chantier, tri par fonction puis nom, sorties STC, mois précédent, squelette matériel du chantier C168, sélection et exclusion d'équipes) |
| Rapport PDF | `PaieBiReportBuilderTest`, `RapportPageModelBuilderTest`, `RapportChartSvgBuilderTest`, `PaieReportHtmlPdfServiceTest` | Agrégation (tous les chantiers dans le graphique, sans « Autres », sections conservées) ; répartition du graphique sur plusieurs pages à tailles égales avec échelle commune ; graphique SVG **pleine largeur** (non-régression) ; génération d'un PDF valide, y compris une charge hostile jamais interprétée comme du balisage; graphique par chantier libellé par le nom (code en repli) ; libellé trop long coupé par « … » ; chantier sans détail par équipe : la section « reste » suit les KPI du chantier sur la même page, sans espace vide |

### Les deux tests de sécurité à connaître

- **Ajouter un endpoint** : `EndpointSecurityTest` échoue tant que la table `PERMISSIONS_ATTENDUES` ne contient
  pas la ligne correspondante. C'est voulu : il force à déclarer la permission **et** à documenter l'endpoint
  dans [rbac/](rbac/README.md) dans le même changement.
- **Affaiblir une permission** (par exemple remplacer `PAIE_DELETE` par `PAIE_READ`) fait échouer le test de la
  table de référence : la permission ne peut changer que volontairement.

---

## Frontend (653 tests unitaires et composants, 39 parcours E2E)

Runner Angular `@angular/build:unit-test` (Vitest 5) dans un **Chromium réel** (Playwright ; `CHROME_BIN` pour réutiliser un Chrome installé), sans Zone.js : les minuteries se pilotent avec `vi.useFakeTimers()`, les doublures avec `vi.fn()`. Les membres de composant utilisés par le gabarit sont `protected` ; un test y accède par `composant['membre']`. Couches : unités (services, utilitaires, gardes, intercepteurs), composants (rendu, clavier, signaux, formulaires, erreurs), E2E (voir plus bas).

| Fichier | Ce qu'il vérifie |
|---|---|
| `app.component.spec.ts` | Lien d'évitement qui met le focus sur le contenu, nom du produit protégé de la traduction, création de l'application, titre, pas de barre latérale sans connexion, barre latérale avec connexion |
| `core/auth/login/login.component.spec.ts` | Validation sans requête, visibilité du mot de passe, navigation après succès, annonce d'erreur 401 |
| `core/theme/theme.service.spec.ts` | Thème : appliqué sur `<html>`, choix mémorisé prioritaire sur la préférence du système, valeur invalide ignorée, bascule mémorisée, transition de couleurs à la bascule puis retirée, aucune au premier affichage |
| `core/navigation/page-title.strategy.spec.ts` | Titre de l'onglet : « Employés · Staport RH », titre de la section gardé pour ses écrans enfants, « Staport RH » seul sans titre |
| `shared/forms/unsaved-changes.guard.spec.ts` | Garde de formulaire : formulaire intact quitté sans question, confirmation demandée quand il est modifié (rester / quitter), plus de question une fois enregistré |
| `shared/forms/focus-first-error.spec.ts` | Focus sur le premier champ invalide, sur le champ interactif d'un champ composé, aucun effet sans erreur |
| `shared/feedback/feedback.service.spec.ts` | Notifications : publication, fermeture manuelle et expiration ; confirmations : acceptation/refus, fermeture et callbacks |
| `shared/feedback/feedback-viewport.component.spec.ts` | Notification d'erreur annoncée et fermable ; dialogue d'alerte modal, contenu accessible et fermeture clavier avec Échap |
| `shared/components/month-picker/month-picker.component.spec.ts` | Mois indisponibles grisés et non sélectionnables, émission au format `aaaa-MM`, bornes de navigation d'année, tous les mois autorisés sans liste |
| `portail/paie/export/paie-export-wizard.component.spec.ts` | Assistant d'export : dernier mois présélectionné, refus sans mois valide, chargement des chantiers, aucune équipe cochée d'office à l'activation d'un chantier, apparition de l'étape matériel (seulement C168 avec CH/OP), contenu des requêtes PDF et Excel, nombres invalides, colonne laissée vide, mémorisation des nombres |
| `portail/paie/cartes/paie-cartes.component.spec.ts` | Vue Cartes : mois sans chargement de chantiers, variation comparée au seul mois contigu, part des chantiers, recherche, ligne « Sans équipe » déduite (et absente sans bulletin sans équipe), clic sur une équipe vers la liste filtrée (rien pour « Sans équipe »), mois déjà chargé non rappelé, mois ou chantier introuvable, sens de la descente |
| `portail/paie/filtres/paie-filtres.spec.ts` | Filtres de la barre dans l'URL : lecture complète, valeurs invalides ignorées, paramètres vides retirés, aller-retour sans perte, critères d'API (undefined pour un filtre absent, mois facultatif) |
| `portail/paie/filtres/paie-filtres.component.spec.ts` | Barre de filtres : mois voisins et bornes, « Tous les mois » / « Choisir un mois », mois non effaçable en analytique, saisies émises une seule fois après le délai, effacement (mois conservé en analytique), cascade (chantiers du mois, équipes des chantiers choisis sans doublon, listes complètes sans mois, mois déjà vu non rechargé), sélecteurs (visibles d'emblée, sans bouton à ouvrir) selon les permissions, fil de navigation des cartes (remontée d'un cran, chantier ouvert nommé), téléphone (filtres du panneau replié comptés, bouton « Filtres » qui déplie et replie) |
| `portail/paie/vues/paie-vues.component.spec.ts` | Coque des vues : filtres lus dans l'URL, filtres de la barre écrits dans l'URL de la vue courante sans la changer, filtre vidé retiré, mois rechargés à chaque changement de vue, mois requis en analytique, fil de navigation seulement dans les cartes, filtres réinitialisés par le sélecteur de vue, actions dans l'en-tête des trois vues, vue recréée (et mois rechargés) après un import |
| `portail/paie/actions/paie-actions.component.spec.ts` | Actions de la paie : chaque bouton (Exporter, Importer, Nouveau bulletin) selon sa permission, aucun sans permission, vue prévenue après un import, aucun import sans mois choisi |
| `shared/components/lazy-select/lazy-select-in-memory.source.spec.ts` | Source en mémoire du sélecteur : pagination, recherche sans casse sans appel serveur, résolution locale, secours pour un identifiant absent |
| `portail/paie/list/paie-list.component.spec.ts` | Vue tabulaire : tous les filtres de l'URL transmis à la première recherche, valeurs invalides ignorées, relance en première page quand les filtres changent, rien quand l'URL change sans changer les filtres |
| `portail/paie/cartes/paie-cartes.component.spec.ts` | Vue Cartes : niveau déduit des filtres, filtres transmis à chaque niveau, variation comparée au seul mois contigu, tuiles et parts calculées sur les chantiers filtrés, ligne « Sans équipe » déduite (et absente sans bulletin sans équipe), clic sur une équipe vers la liste filtrée (rien pour « Sans équipe »), suppression en groupe (réservée à `PAIE_PURGE` : `PAIE_DELETE` ne suffit pas ; cible et nombre de chaque carte, filtres rappelés, confirmation par le nombre retapé, rien sans confirmation valide, annonce du résultat, réponses gardées vidées, remontée aux chantiers, annulation), réponses gardées par filtres, absence de résultat, chantier introuvable, sens de la descente |
| `portail/paie/analytique/paie-analytique.component.spec.ts` | Vue Analytique : mois le plus récent ouvert sans mois dans l'URL (et jamais à la place de celui de l'URL), tous les filtres de l'URL transmis, variations (aucune sans mois précédent, pas de division par zéro), clic sur une barre = filtre chantier ou fonction (dans l'ordre affiché), filtre retiré de l'URL, toute l'évolution même avec un seul mois, tous les chantiers et toutes les fonctions sans plafond, hauteur des graphiques proportionnelle, tri selon la mesure, qualité des données, périmètre vide, aucune paie, évolution à une seule mesure et un seul axe, couleur suivant la mesure dans tous les graphiques, redessin à la bascule de thème, tableaux de données repliés puis dépliés |
| `portail/audit/journal/journal.component.spec.ts` | Journal : première page de la plus récente à la plus ancienne, recherche en temps réel après un délai (retour en première page), bornes de dates, ouverture d'une entrée (contexte, périmètre, modifications paginées), « toutes les entrées de cette requête », cible d'une ligne |
| `portail/audit/historique/audit-historique.component.spec.ts`, `champs/audit-champs.component.spec.ts`, `audit-format.spec.ts` | Historique d'un enregistrement (versions, chargement des plus anciennes, vide), avant / après et éléments ajoutés / retirés, libellés des actions et des champs |
| `core/auth/guards/auth.guard.spec.ts` | `homeGuard` : premier écran autorisé, `/acces-refuse` sans aucune permission (**pas de boucle**), `/login` sans connexion ; `permissionGuard` : accès avec la permission, `/acces-refuse` sans |

`core/interceptors/error.interceptor.spec.ts` couvre en plus la notification d'erreur d'API et le silence de `auth/refresh` (restauration de session).

### Couverture complète par famille (2026-10-10)

Chaque composant, directive, service, intercepteur et utilitaire du frontend a son fichier de test voisin (`*.spec.ts`). Les tests d'écran agissent comme l'utilisateur
(saisie par événements `input`, soumission du `<form>`, clic) plutôt que sur l'état interne ; les aides communes sont dans `shared/testing/` (`formulaire.ts` : `saisir`,
`soumettre` ; `http.ts` : `preparerHttp`, `requete` ; `ecrans.ts` : `fournirPermissions`, `fournirRoute`) et `shared/forms/signal-forms.config.ts` (`fournirSignalForms`, mêmes classes
`ng-invalid` / `ng-touched` que l'application).

| Famille | Fichiers | Ce qu'ils vérifient |
|---|---|---|
| Kit — actions et affichage | `ui/button`, `ui/badge`, `ui/message`, `ui/icon`, `ui/field-error`, `ui/dialog`, `ui/menu/*`, `ui/chart`, `ui/catalogue` | Variantes, icône seule, **bouton en chargement qui bloque aussi les `(click)` du parent** ; sévérités et rôles ARIA ; message d'erreur de champ (affiché une fois touché) ; dialogue modal (titre, Échap, bouton Fermer, pas de fermeture par le fond, piège de focus, tiroir, non fermable) ; menu et bouton scindé (ouverture, actions, action désactivée) ; graphique (création, recréation à la mise à jour, clic sur une donnée, destruction) |
| Kit — champs (`FormValueControl`) | `ui/select`, `ui/number-input`, `ui/password-input`, `ui/date-input`, `ui/month-input`, `components/lazy-select`, `components/column-chooser` | Valeur écrite et lue par Signal Forms, saisie, touché à la sortie du champ, désactivation et focus par le formulaire, `id` absent plutôt que `id="null"` ; sélecteur : simple/multiple, filtre sans accents, **un clic ouvre la liste filtrable**, **les valeurs choisies hors de la page affichée sont conservées**, effacement, défilement infini ; nombre : format français, bornes (**un minimum seul suffit**), décimales ; mois : sélecteur flottant, Échap ; sélecteur différé : première page de 30, recherche serveur après 300 ms, résolution des libellés, pages suivantes ; choix des colonnes : au moins une colonne |
| Kit — tableau | `ui/table` | Rendu par gabarits, tri en mémoire (texte sans accents, nombres, chemins imbriqués, valeurs absentes), pagination en mémoire et serveur (événements `lazyLoad`), lignes cliquables au clavier, colonne d'actions masquée, pied, largeur au clavier, réordonnancement (Alt + flèche, glisser-déposer) |
| Utilitaires | `text/recherche`, `table/table-columns`, `paie/paie-format`, `paie/analytique/paie-chart-theme`, `core/navigation/nav-items`, `forms/soumission`, `forms/filtres`, `validators/mot-de-passe` | Normalisation, état des colonnes (visibilité et ordre), formats français, jetons de design, menu unique par permission, promesse d'enregistrement sans rejet, relance de recherche sans doublon ni requête initiale, règle de mot de passe |
| Services HTTP | `*/services/*.service.spec.ts`, `shared/reference-data/reference-services.spec.ts`, `core/auth/services/*`, `core/auth/interceptors/auth.interceptor.spec.ts` | Contrat avec l'API : méthode, URL, corps, paramètres de page et de tri, fichiers en multipart, réponses binaires ; session (jeton en mémoire seulement, un seul rafraîchissement partagé, 401 rejoué, purge à l'échec) ; sources des sélecteurs (critères, tri, libellé de l'employé) |
| Fiches de consultation | `*/details/*.spec.ts`, `core/auth/access-denied` | Chargement par l'adresse, valeurs affichées, « Modifier » et « Historique » selon les permissions, historique chargé à l'ouverture |
| Listes | `function`, `chantier`, `equipe`, `employee`, `admin/roles`, `admin/users` `/list/*.spec.ts` | Première page et tri par défaut, nombre au singulier/pluriel, actions selon les permissions, recherche après délai, filtres multiples, réinitialisation, suppression confirmée (refus sans effet), import Excel, synchronisation ERP, rôle d'administration non supprimable, réinitialisation du mot de passe |
| Formulaires | `*/form/*.spec.ts`, `core/auth/*/*.spec.ts` | Champs obligatoires signalés (message de la règle), focus sur le premier invalide, longueurs maximales, création et modification (corps envoyé, notification, navigation), formulaire remis à l'état intact après enregistrement, refus du serveur sans perte de saisie, champs verrouillés (employé et période d'un bulletin, identifiant d'utilisateur, rôle protégé), permissions utilisateur regroupées par domaine et états autorisé/refusé recalculés quand les rôles changent |
| Assistant d'export | `paie/export/etapes/*.spec.ts`, `paie-export-wizard.component.spec.ts`, `paie-vue-switcher` | Une spec par étape (mois, format, chantier, équipes, matériel, récapitulatif) montée avec le vrai `PaieExportStore` (`etapes.testing.ts`), puis l'assistant entier |

La suite a passé **653 tests** (91 fichiers) le 2026-10-10. Des avertissements `NG0956` (suivi par identité d'une liste d'un élément) apparaissent dans les tests des cartes de paie ; ils ne sont pas bloquants.

### Tests E2E (Playwright + axe)

`frontend/e2e/` : navigateur réel contre une **API simulée** (`e2e/support/api-mock.ts`, routes `METHODE /chemin` → JSON, appels et corps
enregistrés). Le contrat réel avec le backend reste couvert par les tests d'intégration Spring. Animations réduites
(`reducedMotion`) pour des mesures de contraste stables. Projets : `chromium` (bureau) et `mobile` (Pixel 7).

| Fichier | Parcours |
|---|---|
| `auth.spec.ts` | Connexion accessible, redirection sans session, connexion puis premier écran autorisé, identifiants refusés |
| `permissions.spec.ts` | Lecteur sans actions d'écriture/suppression, gestionnaire avec, accès refusé sans permission de lecture, menu filtré, liste accessible (axe) |
| `fonctions.spec.ts` | Création et fiche, libellé obligatoire sans appel API, suppression confirmée, annulation par Échap, recherche et tri, confirmation avant de quitter un formulaire modifié |
| `paie.spec.ts` | Liste et trois vues (axe), filtres de l'URL transmis à la recherche, navigation entre vues, assistant d'export (axe dans le dialogue, Échap), export PDF limité à un chantier sans vue d'ensemble (étape chantier, récapitulatif, requête envoyée), menu d'import au clavier, fiche d'un bulletin |
| `catalogue.spec.ts` | Axe en thème clair et sombre sur tous les composants du kit ; sélecteur au clavier, clic qui ouvre un sélecteur filtrable, filtre sans accents, dialogue (piège de focus, Échap, focus rendu), tableau (tri, pagination, réordonnancement Alt + flèche) |
| `formulaires.spec.ts` | Signal Forms dans un vrai navigateur : employé (six champs obligatoires signalés, focus, axe ; création avec dates et sélecteurs à la souris ; confirmation en quittant un formulaire modifié), bulletin (montants au format français, mois choisi dans le sélecteur, montant négatif ramené à zéro), utilisateur (règle du mot de passe, affichage du mot de passe, axe), rôle (cocher un domaine) |
| `responsive.spec.ts` | Téléphone : pas de défilement horizontal, menu en tiroir, cibles tactiles ≥ 44 px |

Ajouter un parcours : le programmer avec `mockApi(page, utilisateur, routes)` ; une route d'API non simulée répond `404` et fait échouer le test de façon visible. Le CI les rejoue (`npm run e2e`) après le build.

---

## Règles pour écrire un test

- Un test décrit un comportement métier, son nom est une phrase (`creerSiAbsent_neDoitJamaisModifierUnChantierExistant`).
- Tester le **comportement** (ce qui est enregistré ou renvoyé), pas l'implémentation interne.
- Toute règle métier tranchée avec la direction a son test (ex. « un import ne modifie jamais un existant »).
- Un bug corrigé reçoit un **test de non-régression** (ex. largeur du graphique du rapport).
- Une règle de sécurité (permission, jeton) est testée à travers la vraie chaîne quand c'est possible.
- Ne jamais dépendre de données de production : les tests créent leurs propres données ou simulent les
  dépendances.
- Après une modification : lancer les tests backend **et** le build du frontend avant de considérer la tâche
  terminée (`CLAUDE.md`).

## Ce qui n'est pas testé automatiquement

- Les écrans Angular Employé, Fonction, Chantier, Équipe, Utilisateurs, Rôles et l'authentification (les écrans Paie et Audit, les guards et la coque de l'application le sont).
- Un parcours full stack avec frontend réel, API Spring réelle et PostgreSQL réel : les E2E Playwright simulent
  actuellement l'API, et les tests backend Testcontainers ne démarrent pas le frontend. La convention impose
  d'ajouter ce niveau par domaine et avant fusion des changements concernés.
- Le rendu visuel du rapport PDF : vérifié à la main (les tests contrôlent la structure et les nombres, pas
  l'apparence).
- La synchronisation avec l'ERP réel (le client HTTP est simulé).
- L'envoi réel de courriel.
