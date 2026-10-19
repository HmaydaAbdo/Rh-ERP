# Handoff — état du projet ERP-RH

Dernière mise à jour : 2026-10-19, à la reprise du projet par un nouvel agent (Codex).

Ce document dit **où en est le projet, comment le propriétaire veut travailler et ce qui reste ouvert**. Il ne remplace ni
`AGENTS.md`, ni `conventions/` (source de vérité), ni `TODO.md` (liste vivante des sujets) : il y renvoie.

---

## 1. Par où commencer

1. `AGENTS.md`, puis les conventions dans l'ordre qu'il donne.
2. `docs/README.md` (index de la documentation) et le README du domaine touché (`docs/<domaine>/README.md`).
3. Les deux dernières décisions d'architecture :
   [ADR 0009 — carte : satellite, relief et 3D](../adr/0009-carte-satellite-relief-3d.md) et
   [ADR 0010 — la fiche employé porte l'état du dernier mois de paie](../adr/0010-employe-etat-du-dernier-mois-de-paie.md).
4. `TODO.md` pour les sujets ouverts.

---

## 2. Travail récent (fusionné dans `main`)

| Date | PR | Contenu |
|---|---|---|
| 2026-10-18 | #73 | **Carte des chantiers** « niveau Google Maps » : monde en globe, relief et terrain 3D, bâtiments 3D, satellite Esri via une clé ArcGIS gratuite et obligatoire, avec secours automatique. Fond auto-hébergé dans `carte-fond/` à côté de `docker-compose.yml`. Voir `docs/chantier/carte.md`. |
| 2026-10-19 | #74 | **Employés en cinq lots** : (1) coque à onglets Tabulaire / Cartes / Analytique, filtres dans l'URL ; (2) fiche = état du dernier mois de paie (équipe, salaire et type, table `employe_sortie`, reprise **V30**) ; (3) **assistant d'import de la paie** (analyse, corrections des fiches, départs) ; (4) fiche et **parcours** de l'employé ; (5) vues **Cartes** et **Analytique**. Voir `docs/employee/README.md` et `docs/paie/README.md`, « Import Excel (assistant) ». |

À la fusion de #74 : 410 tests backend, 762 tests frontend, 54 E2E, CI complète verte ; images Docker publiées par la CI au
tag `latest` et au SHA `91033db77469d67e174e3992030e4f77c9f2a2fd`.

---

## 3. Déploiement en cours

- **Sauvegarde faite** le 2026-10-19 avant la mise à jour : `rh-erp-20261019T152826Z.tar.gz.age` (serveur, `./backups/`),
  contrôles d'intégrité OK. Elle est chiffrée avec `age` ; la clé privée est hors serveur (voir `docs/deployment.md`).
- **À faire par le propriétaire** : `docker compose pull` puis `docker compose up -d`. Au démarrage, Flyway applique **V29**
  (colonnes de la fiche, table des départs) et **V30** (reprise : fiches alignées sur le dernier bulletin, statut, départs,
  **suppression des employés sans aucun bulletin**). V30 est irréversible sans la sauvegarde.
- **Ensuite** : essayer l'assistant d'import avec le vrai fichier de paie d'**octobre 2026** (premier vrai usage).

---

## 4. Règles du propriétaire (à respecter sans les redemander)

**Façon de travailler**
- Il écrit en français ; répondre en français, textes de l'interface en français.
- Il choisit les sujets : travailler **point par point**, ne jamais lancer un sujet qu'il n'a pas choisi.
- Avant tout choix d'architecture (nouvelle abstraction, nouveau mécanisme, règle métier absente), **poser la question** avec
  des options et une recommandation ; ne jamais inventer une règle métier ou une valeur (tranches, seuils, motifs…).
- Une fois un plan validé, il veut une exécution autonome de bout en bout (code, tests, vérification à l'écran, docs) et un
  seul bilan à la fin.
- Il juge l'interface sur captures : « premium », fluide, lisible sur téléphone. Vérifier soi-même à l'écran.

**Git**
- `main` est **protégée** : un push direct est refusé. Le circuit : une branche, une PR, la CI verte, la fusion, puis la
  **suppression de la branche** et la synchronisation de `main` en local. À la fin, il ne doit rester **que `main`** et
  **aucune PR ouverte**.
- Un commit par lot cohérent, message en français ; ne jamais mélanger ses propres modifications en cours.

**Décisions déjà prises**
- Carte : **gratuité absolue**, sans rien payer ni maintenant ni plus tard, même en pic ; le monde entier ; lancement possible
  par `docker compose` **et** par `ng s` (jonction `frontend/carte-fond` → `../carte-fond`, voir `docs/chantier/carte.md`).
- Employés (ADR 0010) : la fiche est l'état du **dernier mois de paie importé** ; l'historique se calcule depuis les bulletins ;
  l'import de la paie n'accepte que le **mois qui suit exactement** le dernier ; un fichier ne s'importe que s'il concorde avec
  les fiches (pas de bulletin qui diverge de la fiche) ; **salaire à 0 = erreur du fichier** ; départs (STC, absents) tous
  cochés, motif obligatoire ; le salaire est réservé à `PAIE_READ`.
- Tranches de l'Analytique des employés : âge < 25, 25-34, 35-44, 45-54, 55+ ; ancienneté < 1 an, 1-3, 3-5, 5-10, 10+.
- Cartes des employés : descente **libre** (chantier, équipe, fonction, dans l'ordre choisi) et accès à la liste à tout moment.
- Ne plus demander si la production a les mêmes données que le développement : tout se règle sur la **dernière paie
  importée**, quel que soit l'état de la base.

---

## 5. Environnement de développement (poste Windows du propriétaire)

- **Le port 4200 est le `ng serve` du propriétaire** ; ne pas le remplacer. Les E2E Playwright lancent leur propre serveur sur
  le port **4300** (`npx playwright test`).
- **Sa pile Docker** (`erp-rh-*`, ports 5000–5002) est son environnement : ne pas l'arrêter ni la modifier. Pour essayer une
  migration sur de vraies données : copier la base dans une base jetable (`pg_dump | psql` dans le conteneur postgres), puis la
  supprimer.
- **Tests backend** : `./mvnw -B -o test` ; les tests d'intégration démarrent leur propre PostgreSQL (Testcontainers, Docker
  doit tourner). Exporter les variables du job `backend` de `.github/workflows/ci.yml` (`JWT_SECRET`, `FRONTEND_URL`,
  `COOKIE_SECURE`, `ADMIN_*`, `SMTP_*`, `MAIL_FROM`, `CHANTIER_SYNC_BASE_URL`).
- **Tests frontend** : `npm test` (navigateur ChromiumHeadless) ; un sous-ensemble avec
  `npx ng test --watch=false --browsers=ChromiumHeadless --include='src/app/…/*.spec.ts'` ; contrôle de types rapide
  `npx ngc -p tsconfig.app.json --noEmit`.
- **E2E instables sous charge** : avec 4 workers, quelques tests (écrans d'administration, axe des Fonctions) dépassent les
  30 s pendant que `ng serve` compile à froid. Relancer avec `--workers=1` avant de soupçonner une régression.
- Les fichiers du dépôt sont en partie en CRLF : normaliser avant un remplacement de texte par script.
- Pièges de code connus : Java 17 à la compilation (pas de `switch` à motifs) ; pas de `${VAR:defaut}` dans les `yml` ; toute
  méthode d'écriture d'un service porte `@AuditableAction` (test d'architecture) ; une migration qui modifie des données
  auditées suit le gabarit de `conventions/database.md` ; `EndpointSecurityTest` tient la table de référence des permissions
  de chaque route (la compléter pour toute nouvelle route).

---

## 6. Sujets ouverts

Le détail est dans `TODO.md`. Les principaux :

- **Assistant d'import** : premier usage réel sur le fichier d'octobre 2026, à suivre.
- **Vues Cartes et Analytique** pour Chantiers, Fonctions et Équipes : seule la vue tabulaire existe (section « Vues Cartes,
  Tabulaire et Analytique »).
- **Qualité des données** (« Prochaine tâche ») : tous les champs obligatoires et aucun doublon, dans tous les domaines.
- **Conformité backend** (`docs/conformite/README.md`) : G3 (paramètres métier administrables), G5, G6, G10 en attente de
  décision ; la migration **PostgreSQL 17 → 18 en production** est à faire en tout dernier, avec sauvegarde et répétition.
- **Carte** : recherche de lieux reportée ; la clé ArcGIS (`ARCGIS_API_KEY`) expire au plus tard un an après sa création.
- **Domaines à venir** : Pointage, puis paie calculée depuis le Pointage (section « Évolutions prochaines »).
