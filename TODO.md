# TODO — Chantiers transverses

> Suivi des sujets d'architecture transverse identifiés pendant la construction des domaines,
> volontairement différés pour ne pas bloquer l'avancement domaine par domaine
> (conventions/architecture.md — « ne jamais introduire une abstraction sans nécessité clairement identifiée »).

---

## Questions ouvertes — en attente d'une réponse (2026-09-23)

Sujets soulevés en cours de route, jamais explicitement tranchés par HMAYDA — un choix par défaut a
été appliqué dans chaque cas pour ne pas bloquer l'avancement, mais aucun n'a été confirmé :

- **Comparaison chantier/équipe pour le squelette matériel (C168)** : `PaieExportService` compare
  le chantier et l'équipe de façon insensible à la casse et aux espaces superflus, alors que le
  regroupement en sous-feuilles équipe ailleurs dans le même export (et la sélection équipe par
  chantier de `PaieExportRequestDto`) est volontairement une correspondance **exacte**
  (`"Equipe A"` ≠ `"EQUIPE A"`, voir `docs/paie/README.md`, section « Regroupement par équipe »).
  Si une correspondance stricte est préférée pour cette règle aussi, le changement est mineur — voir
  `PaieExportService.squeletteMateriel`.
- **`conventions/frontend.md` — Angular Signals autorisés pour l'état local** : la version d'origine
  du fichier interdisait les Signals (probablement un reliquat d'un autre projet, jamais confirmé
  comme un choix délibéré pour rh-erp). Lors du nettoyage des conventions, la règle a été changée
  pour autoriser les Signals (état synchrone simple) aux côtés de RxJS (flux asynchrones) — cohérent
  avec le code déjà livré (`AuthService`, `AppComponent`), mais ce changement de convention n'a
  jamais été explicitement validé.
- **JWT signé en HS256 (secret partagé) plutôt qu'en RS256 (paire de clés)** : choix fait pour
  rester simple — un seul service (le backend) émet et valide les tokens, un secret symétrique
  suffit et évite de gérer une paire de clés. Pertinent à revoir uniquement si un jour un autre
  service doit valider les tokens sans connaître le secret d'émission.

---

## Sécurité (JWT / RBAC) — v2 livrée (backend + frontend)

**Décision (HMAYDA, 2026-09-22)** : authentification JWT auto-émise (Access Token 15 min + Refresh
Token opaque 30 jours, rotation à usage unique, cookie httpOnly) + RBAC dynamique (rôles et
permissions administrables via `/roles`/`/users`, deny overrides individuels — deny > permissions
des rôles). Détail complet de la conception : `conventions/security.md`.

**Livré et vérifié end-to-end** (login, refresh, rotation/reuse detection, logout, mot de passe
oublié par email via Mailpit, création de rôle + utilisateur + deny override via l'UI réelle,
401/403 corrects, gating des boutons Supprimer et de la sidebar par permission effective) :

- Module backend `staport.rh.auth` complet : entités (`Utilisateur`/`Role`/`Permission`/
  `RefreshToken`/`ResetPasswordToken`), migrations Flyway `V3`/`V4` (schéma + seed permissions/
  rôles), JWT (`JwtService`, `SecurityConfig`), services (`AuthService`/`UserService`/
  `RoleService`), contrôleurs (`AuthController`/`UserController`/`RoleController`), email de reset
  (`EmailService` + Mailpit en dev, `docker-compose.yml`).
- `@PreAuthorize` appliqué sur tous les endpoints des 4 domaines (Chantier/Employee/Function/Paie) —
  tous les `TODO(security)` précédents sont résolus.
- Compte `SYSTEM_ADMIN` de bootstrap créé automatiquement au démarrage (`AdminBootstrapRunner`,
  variables `ADMIN_USERNAME`/`ADMIN_EMAIL`/`ADMIN_PASSWORD`).
- Bug corrigé au passage : `GlobalExceptionHandler` catchait `AccessDeniedException` dans son
  handler générique `Exception.class` et renvoyait 500 au lieu de 403 — un handler dédié a été
  ajouté (doit toujours précéder le handler générique dans le même `@RestControllerAdvice`).
- Frontend `core/auth` (login/forgot-password/reset-password, `AuthService` avec Access Token en
  mémoire uniquement, intercepteur avec refresh silencieux partagé en cas de 401 concurrents,
  `authGuard`/`permissionGuard`) + `portail/admin` (gestion utilisateurs/rôles, assignation
  permissions par domaine, deny overrides recalculés selon les rôles sélectionnés). Boutons
  "Supprimer" des 4 domaines et liens sidebar "Utilisateurs"/"Rôles" conditionnés à la permission
  effective (`authService.hasPermission(...)`), plus un bug de proxy corrigé au passage
  (`/auth`, `/users`, `/roles`, `/permissions` manquaient de `proxy.conf.js`, 404 systématique).
- `docs/rbac/{auth,chantier,employee,function,paie}.md` créés (endpoint ↔ permission, éléments
  frontend gatés).

**Reste à faire** :

- Détection de compromission en cascade du Refresh Token (voir `conventions/security.md`, Points
  d'attention) — non traité, risque accepté pour l'instant.
- ~~Revoir `SameSite=Lax` si le frontend est un jour déployé séparément du backend~~ — **confirmé
  correct** par l'architecture de production livrée le 2026-09-23 (voir section « Déploiement
  production » ci-dessous) : nginx inner relaie lui-même les appels API vers le backend sur le
  réseau Docker interne, le navigateur ne voit jamais qu'une seule origine (celle de nginx inner/
  outer), en production comme en développement. Rester vigilant si l'architecture change un jour
  (ex. frontend et backend derrière deux domaines distincts sans proxy interne).
- Pas de sélecteur/recherche d'employé dans le formulaire utilisateur (lien `employeeId` optionnel
  saisi en brut par identifiant numérique) — acceptable pour l'instant, aucun utilisateur réel n'a
  encore ce besoin.
- Boutons "Importer"/"Synchroniser"/"Exporter" ne sont pas gatés côté frontend (seul le 403 backend
  protège) — voir `docs/rbac/*.md`, à faire si le besoin se confirme.
- Pas de test d'intégration validant réellement l'application des `@PreAuthorize` (ex. MockMvc +
  `spring-security-test`, ou `@SpringBootTest` avec un vrai token) — les tests unitaires actuels
  (`*ServiceTest`) mockent la couche Service et ne passent jamais par la chaîne de sécurité ; seule
  une vérification manuelle (curl, navigateur) a confirmé l'enforcement réel des permissions par
  endpoint lors de la livraison du 2026-09-22.

---

## Audit (Hibernate Envers)

**État actuel** : aucune dépendance Envers, aucun aspect d'audit (`GenericAuditAspect`), aucune table
`Log` — l'infrastructure décrite dans `conventions/audit.md` n'existe pas encore dans ce projet.

**À faire** :

- Ajouter `hibernate-envers` et mettre en place `GenericAuditAspect` + `@AuditableAction` +
  table `Log` (voir `conventions/audit.md`).
- Annoter les entités sensibles avec `@Audited` — au minimum `Employee` (donnée d'identité : CIN,
  nom, dates) et `Paie` (montants, historique de paie).
- Décider si `Function`/`Chantier` (référentiels) nécessitent l'audit ou non.

---

## Domaines restants

- **Pointage** : à construire, en réutilisant `IEmployeeService` (et probablement `IPaieService`)
  comme façade — jamais leurs Repository directement.
- **Paie** : construite (`staport.rh.paie`) — CRUD, import Excel, export multi-feuilles. Voir
  [docs/paie/README.md](docs/paie/README.md). Le calcul automatique du salaire (voir section
  dédiée ci-dessous) reste à faire, probablement en lien avec Pointage.

---

## Imports Excel — comportement atomique (tout ou rien)

Les imports Function, Employee et Paie ont été rendus **atomiques** : une seule ligne invalide
rejette tout le fichier (`400`, `crees = 0`), rien n'est persisté. Avant ce changement, Function et
Employee traitaient les fichiers **au mieux** (les lignes valides étaient créées, les lignes
invalides simplement ignorées et listées). Voir `docs/function/README.md`, `docs/employee/README.md`
et `docs/paie/README.md`, section « Comportement » de chacun.

**Conséquence sur les fichiers réels connus** : `functions.xlsx` et `employee.xlsx` contenaient, lors
des tests initiaux, un nombre significatif de lignes invalides ou en doublon.

- **Function** : résolu — `functions.xlsx` a été nettoyé par l'utilisateur (2026-09-22) et ne contient
  désormais que des valeurs distinctes, une ligne par fonction.
- **Employee** : partiellement résolu par l'évolution création/mise à jour ci-dessous — un CIN déjà
  en base ne bloque plus l'import (il déclenche une mise à jour), seules les lignes réellement
  invalides (champs manquants, chantier/fonction introuvables) bloquent encore le fichier.

Un bouton "Modèle Excel" (voir section dédiée ci-dessous) aide désormais à éviter que l'utilisateur
ne casse le format attendu en repartant d'un fichier bricolé.

---

## Function — suppression du champ `actif`, modèle Excel téléchargeable

**Décision (HMAYDA, 2026-09-22)** : le champ `actif` de `Function` n'avait pas de sens métier pour ce
référentiel (une fonction existe ou n'existe pas, contrairement à Chantier qui peut légitimement être
désactivé sans être supprimé) — **retiré partout** : entité, DTOs, spécification de recherche,
colonne `actif` et index `idx_fonction_actif` en base, filtre/tag "Statut" dans l'UI Function. Les
imports Employee et Paie, qui filtraient le référentiel Function sur `actif` avant résolution,
chargent désormais tout le référentiel sans filtre ; les messages d'erreur "Fonction introuvable ou
inactive" sont devenus "Fonction introuvable" (le cas "inactive" n'existe plus).

Ajout d'un bouton "Modèle Excel" dans l'UI Function (`GET /functions/import/modele`) qui télécharge
un fichier `.xlsx` vierge avec uniquement l'en-tête attendu — pour que l'utilisateur reparte toujours
d'un fichier au bon format avant d'importer, plutôt que de deviner ou de risquer de casser la
structure attendue. Voir `FunctionImportService.genererModele()` et
[docs/function/README.md](docs/function/README.md).

---

## Import Employee — création et mise à jour en masse par CIN

**Décision (HMAYDA, 2026-09-21)** : l'import Excel Employee (`POST /employees/import`) crée ou met à
jour selon que le CIN de la ligne existe déjà en base — même bouton, même fichier, détection
automatique (pas d'endpoint séparé). Une ligne dont le CIN correspond à un employé existant
**remplace tous ses champs** (nom/prénom, dates, fonction, chantier) — ce n'est jamais un merge
partiel, cohérent avec le modèle « ré-import = correction » déjà en place pour Paie. Voir
`docs/employee/README.md`, section « Import Excel ».

⚠️ **Révisé le 2026-09-22** : cette décision ajoutait initialement une 7ᵉ colonne optionnelle Statut.
Elle a été retirée — voir section dédiée ci-dessous : le statut n'a jamais fait partie du format
`employee.xlsx` réel et ne doit pas en faire partie.

**Bug corrigé au passage** : la première version de l'atomicité (Paie, puis Employee) chargeait et
mutait l'entité JPA existante *pendant* la boucle de validation, avant de savoir si le fichier entier
serait accepté. Une entité JPA gérée mutée est susceptible d'être persistée par le dirty-checking
d'Hibernate (flush automatique) même sans appel explicite à `save()`, ce qui aurait silencieusement
cassé la garantie « tout ou rien » pour les lignes de mise à jour. Corrigé en ne chargeant/mutant les
entités existantes que dans la phase finale de persistance (atteinte uniquement si tout le fichier
est valide) — voir `PaieImportService` et `EmployeeImportService`.

---

## Employee — dates obligatoires en base, retrait du Statut de l'import, modèle Excel téléchargeable

**Décision (HMAYDA, 2026-09-22)** :

- `date_naissance` et `date_embauche` sont désormais `NOT NULL` au niveau entité/base (elles
  l'étaient déjà via la validation `@NotNull` des DTO API et via l'import, qui les rendait toujours
  obligatoires — la contrainte base était le seul maillon encore permissif). Voir `Employee.java`.
- La 7ᵉ colonne optionnelle Statut, ajoutée le 2026-09-21 à l'import Excel, a été **retirée** : elle
  ne fait pas partie du format `employee.xlsx` réel et n'a pas à en faire partie. L'import redevient
  strictement **6 colonnes**. Le statut ne peut plus être modifié qu'à l'unité, via le formulaire UI
  — jamais en masse par l'import (création = toujours `ACTIF`, mise à jour = statut existant jamais
  touché).
- Ajout d'un bouton "Modèle Excel" (`GET /employees/import/modele`), même principe que celui de
  Function : télécharge un fichier `.xlsx` vierge avec uniquement les 6 en-têtes attendus, pour que
  l'utilisateur parte toujours d'un format valide plutôt que de deviner ou de casser la structure
  attendue.

Voir [docs/employee/README.md](docs/employee/README.md), sections « Modèle de données » et
« Import Excel ».

---

## Calcul automatique de la paie

**Décision (HMAYDA, session Paie)** : à terme, aucune valeur calculable ne doit être saisie à la
main — le système doit calculer lui-même tout ce qui peut l'être (salaire total à partir du salaire
de base, des jours travaillés, des primes, etc.), sans intervention humaine.

**Premier pas fait (HMAYDA, 2026-09-22)** : `salaireTotal` est désormais **toujours calculé**
(`salaireMensuel + primeRoulageOrdinaire + primeRoulageDimanche`, primes nulles comptées pour zéro),
côté API (`create`/`update`, champ retiré de `PaieCreateRequestDto`/`PaieUpdateRequestDto`) et côté
import Excel (colonne "Total" du fichier lue puis ignorée, jamais utilisée). Voir
`Paie.calculerSalaireTotal()` (pas de setter public sur ce champ) et
[docs/paie/README.md](docs/paie/README.md), section « Règles métier ». Le formulaire UI affiche un
aperçu local non soumis (recalculé en direct pendant la saisie), le serveur recalculant de toute
façon et faisant foi.

**Reste à faire** : `salaireMensuel` et les primes de roulage restent des valeurs saisies/importées
telles quelles — aucune formule officielle n'a été fournie pour les calculer à leur tour
(conventions/architecture.md : ne jamais inventer une règle métier absente). Ce calcul complet dépend
du domaine Pointage (jours travaillés/récupérés en entrée) — voir la section dédiée ci-dessous,
« Paie calculée depuis Pointage (roadmap) ».

---

## Paie calculée depuis Pointage, statuts provisoire/validé (roadmap — Pointage n'existe pas encore)

**Décision (HMAYDA, 2026-09-22)**, à construire une fois le domaine Pointage entamé :

- **Fin de l'import Excel pour la paie** : dans une version future, la paie ne sera plus saisie ni
  importée — elle sera **calculée automatiquement dès la saisie du Pointage** du mois correspondant
  (jours travaillés, récupérations, etc.). `PaieImportService`/`PaieImportController` (et le bouton
  "Importer" de l'UI Paie) seront alors retirés, remplacés par un déclenchement automatique du calcul
  à la validation du Pointage. Poursuite logique du calcul déjà automatique de `salaireTotal` (voir
  section ci-dessus) : à terme, plus aucune valeur calculable n'est saisie nulle part pour la paie.
- **Statuts provisoire / validé, pour Pointage et pour Paie** : chacun des deux domaines doit
  introduire un statut à deux valeurs — *provisoire* (éditable) et *validé* (figé, non modifiable une
  fois passé dans cet état). Un pointage ou un bulletin de paie d'un mois donné ne pourra être saisi
  que si le mois précédent est déjà **validé** — progression strictement séquentielle, mois par mois,
  jamais de saisie en avance sur un mois non clos. Implique une machine à états (au minimum
  provisoire → validé, à voir si un retour arrière est nécessaire) et une validation d'enchaînement
  des périodes à chaque création, à concevoir en détail le moment venu (voir
  `conventions/architecture.md` — ne jamais introduire cette abstraction avant d'en avoir besoin ;
  ce n'est pour l'instant qu'une décision actée, pas une implémentation).

Aucun code n'existe encore pour ces deux points — consignés ici pour ne pas les perdre, à reprendre
lors de la construction du domaine Pointage.

---

## Base de données — résolu (MySQL → PostgreSQL 17 + Flyway)

**Décision (HMAYDA, 2026-09-22)** : migration de MySQL vers **PostgreSQL 17** (image
`pgvector/pgvector:pg17`, extension `pgvector` activée en anticipation d'un usage futur — pas
d'usage actuel, voir `conventions/deployment.md`). Le schéma est désormais géré par des migrations
**Flyway** versionnées (`backend/src/main/resources/db/migration/`), `ddl-auto` passé à
`validate` : Hibernate ne fait plus jamais évoluer le schéma, il vérifie seulement sa cohérence
avec les entités JPA au démarrage. Voir `conventions/database.md` et `conventions/deployment.md`.

**Risque précédent, désormais résolu** : ce projet tournait auparavant avec `ddl-auto: create-drop`
— chaque redémarrage supprimait et recréait toutes les tables, y compris `employe` et `paie` (perte
définitive des employés et bulletins de paie créés/importés sans équivalent ERP). Ce n'est plus le
cas : les données persistent désormais entre redémarrages, y compris dans le volume Docker
`postgres_data`.

Point d'implémentation notable pour référence future : Spring Boot 4.1.1 ne suffit pas à activer
l'autoconfiguration Flyway simplement en ajoutant `flyway-core` — il faut explicitement dépendre de
`org.springframework.boot:spring-boot-flyway` (l'intégration Flyway est un artefact séparé du
`spring-boot-autoconfigure` principal depuis la modularisation de Spring Boot 4). Voir
`backend/pom.xml`.

Démarrage du projet : voir [README.md](README.md) et `conventions/deployment.md` — Docker Compose
est désormais le mode de démarrage de référence.

---

## Déploiement production — Docker Compose, nginx inner/outer, CI (2026-09-23)

**Décision (HMAYDA, 2026-09-23)** : `docker-compose.yml` est devenu un Compose de **production
uniquement** — plus de `build:`, plus de bind mount du code frontend, plus de service Mailpit ;
uniquement des `image:` publiées sur Docker Hub (buildées par la CI). Le développement actif se
fait désormais toujours en local (`./mvnw spring-boot:run` / `ng serve`), jamais via ce Compose —
voir README.md et `docs/deployment.md` (architecture complète : nginx inner/outer, réseaux, ports
liés à `127.0.0.1`, catalogue de variables) et `conventions/deployment.md` (pattern générique).

**Livré et vérifié end-to-end** (build des deux images, stack complète démarrée, login à travers
nginx inner → backend → Postgres, SPA fallback et cache statique testés) :

- `frontend/Dockerfile` : multi-stage Node (build Angular) → `nginx:1.27-alpine` (sert
  `dist/frontend/browser`). `frontend/nginx.conf` : nginx inner complet (pas un simple bloc
  `server`) — reverse-proxy interne vers le backend pour `/auth`, `/users`, `/roles`,
  `/permissions`, `/actuator/health`, `/swagger-ui`, `/v3/api-docs`, et pour `/employees`,
  `/chantiers`, `/functions`, `/paie` avec désambiguïsation par en-tête `Accept` (ces quatre
  préfixes existent à la fois comme route Angular et comme préfixe d'API — voir
  `frontend/proxy.conf.js` pour l'équivalent en développement).
- `docker-compose.yml` : réseaux explicites (`db-net` : postgres+backend, `web-net` :
  backend+frontend — le frontend ne peut pas atteindre postgres), tous les ports publiés liés à
  `127.0.0.1:${VAR}` (jamais exposés à Internet), healthchecks sur les trois services,
  `depends_on: condition: service_healthy` en cascade.
- `.github/workflows/ci.yml` : tests + build + push des images sur push vers `main` (tags
  `<git-sha>` et `latest`, plus un tag de version sur un push de tag `v*`) ; tests uniquement sur
  pull request (pas de secrets Docker Hub exposés à une PR).
- Bug corrigé au passage : Spring Boot Actuator active automatiquement un indicateur de santé mail
  dès que `spring-boot-starter-mail` est sur le classpath — `/actuator/health` passait à `DOWN`
  (donc le conteneur `unhealthy`, donc le frontend jamais démarré via `depends_on`) dès que le
  serveur SMTP était injoignable, alors que l'application elle-même fonctionnait normalement. Fixé
  via `management.health.mail.enabled: false` (voir `backend/src/main/resources/application.yml`).
- `frontend/src/app/app.component.spec.ts` corrigé au passage : cassé depuis l'ajout d'`AuthService`
  à `AppComponent` (JWT/RBAC, voir plus haut) — `HttpClient` n'était pas fourni dans le
  `TestBed`. Utilise désormais un stub d'`AuthService` pour tester les deux états (authentifié/non).

**Reste à faire** :

- **Backup PostgreSQL** — préparé (voir `docs/deployment.md`, section dédiée) mais pas implémenté :
  fréquence, rétention et destination de stockage externe restent à décider avant implémentation.
- **CD** — le déploiement (`docker compose pull && up -d` sur le serveur) reste manuel ; à
  automatiser séparément une fois le besoin confirmé (voir `docs/deployment.md`).
- **Nginx outer** — l'ajout du bloc `location /rh-erp/` (ou le sous-chemin réellement choisi) à la
  configuration nginx outer partagée du serveur reste une action manuelle côté serveur, hors de ce
  dépôt (snippet prêt dans `docs/deployment.md`).
- Les boutons "Importer"/"Synchroniser"/"Exporter" ne passent pas par nginx inner avec une
  distinction particulière (pas de collision de route Angular pour eux) — RAS, aucune action
  requise, juste noté pour référence si un nouveau domaine introduit un préfixe ambigu similaire à
  l'avenir.

---

## Synchronisation Chantier (ERP)

- Le rapprochement se fait par `code` (l'`id_chantier` renvoyé par l'ERP n'est pas fiable comme
  identifiant par chantier — une même valeur est partagée par plusieurs dizaines de chantiers dans
  les données réelles ; voir le commentaire sur `Chantier.sourceErp`).
- `CHANTIER_SYNC_BASE_URL` est une variable d'environnement obligatoire (voir `backend/.env.example`)
  — l'application refuse de démarrer si elle est absente.
- Planification quotidienne à 23h (`chantier.sync.cron` dans `application.yml`) + déclenchement
  manuel via `POST /chantiers/sync` (bouton "Synchroniser maintenant" dans l'UI).
- `POST /chantiers/sync` requiert la permission `CHANTIER_SYNC` (voir `docs/rbac/chantier.md`).

**Décision (HMAYDA, 2026-09-22)** : `upsert` ne force plus `actif = true` sur un chantier déjà
existant — seule la création applique ce défaut. Correction d'un comportement non voulu détecté lors
de la revue de doc : l'ERP n'exposant aucun champ actif/statut (seulement `id_chantier`, `code`,
`designation`, `CodeErreur`), forcer `actif = true` à chaque synchronisation réactivait
silencieusement tout chantier désactivé manuellement dès que son `code` réapparaissait dans un import
ERP. Voir `ChantierSyncTransactionalOperations.upsert` et
[docs/chantier/README.md](docs/chantier/README.md), section « Règles métier ».

**Décision (HMAYDA, 2026-09-22)** : `CodeErreur` n'est plus utilisé comme filtre, et la désactivation
automatique des chantiers absents d'un import ERP (`desactiverChantiersAbsents`) a été **retirée**.
La synchronisation est désormais un simple upsert par `code` : chaque ligne reçue (dès qu'elle a un
`code`) crée ou met à jour un chantier, quelle que soit la valeur de `CodeErreur` ; un chantier absent
d'un import conserve simplement son état précédent, il n'est plus jamais désactivé automatiquement.
`ChantierSyncResultDto.desactives` et `ChantierRepository.findBySourceErpTrue()` ont été supprimés
(devenus du code mort). Voir `ChantierSyncService`, `ChantierSyncTransactionalOperations` et
[docs/chantier/README.md](docs/chantier/README.md), section « Synchronisation ERP ».

---

## Import Paie — création automatique des fonctions manquantes, modèle Excel téléchargeable

**Décision (HMAYDA, 2026-09-22)** : l'import Excel Paie (`POST /paie/import`) exige toujours que
l'**employé** (CIN) et le **chantier** existent déjà — jamais créés automatiquement, une ligne dont
l'un des deux est introuvable rejette le fichier comme avant. La **fonction** fait désormais
exception : une fonction référencée par une ligne mais absente du référentiel n'est plus une erreur,
elle est **créée automatiquement** (via `IFunctionService.create`, mêmes règles qu'un import Function
— dédupliquée si plusieurs lignes du fichier référencent le même libellé inédit). Toujours soumis à
l'atomicité déjà en place : aucune fonction n'est créée si le fichier est finalement rejeté à cause
d'une autre ligne (création différée à la phase de persistance finale, même précaution que pour la
mutation des bulletins existants). `PaieImportResultDto.fonctionsCreees[]` liste les libellés créés,
affichés explicitement dans l'UI (toast + détail du résultat) pour que l'import ne crée jamais un
nouveau référentiel en silence.

Ajout d'un bouton "Modèle Excel" (`GET /paie/import/modele`), même principe que Function/Employee.

Voir `PaieImportService.creerFonctionsManquantes`/`genererModele` et
[docs/paie/README.md](docs/paie/README.md), section « Import Excel ».

---

## Module Paie — retrait de paie_old (terminé)

**Décision (HMAYDA, 2026-09-21)** : l'ancien module `staport.rh.paie_old` (et sa route
`/paie-legacy`) a été **définitivement supprimé** — code et tests retirés du dépôt. La table
`employe_paie` (celle de `paie_old`, distincte de la table `paie` du nouveau module) ne sera plus
recréée au prochain redémarrage, `ddl-auto: create-drop` ne générant le schéma qu'à partir des
entités restantes (voir section « Base de données » ci-dessus). Le module `staport.rh.paie`
(routes `/paie`, `/paie/import`, `/paie/export`) est désormais la seule implémentation Paie du
projet ; il couvre CRUD, import Excel atomique (création/mise à jour), export multi-feuilles. Voir
[docs/paie/README.md](docs/paie/README.md) pour le détail du fonctionnement, y compris le design
snapshot (employé/fonction/chantier/équipe figés par bulletin) et la contrainte d'unicité
(employé, période).

Ce projet n'étant pas sous contrôle de version (pas de dépôt git), cette suppression est
irréversible — décision prise et exécutée avec confirmation explicite de l'utilisateur.
