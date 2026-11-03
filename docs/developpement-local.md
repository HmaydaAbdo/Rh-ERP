# Développement local et décisions durables du propriétaire

Ce document garde, pour le poste Windows du propriétaire et les assistants qui y travaillent, ce qui ne se lit pas dans le
code. L'avancement des tâches n'y figure pas : il vit dans Jira (projet `KAN`, voir [`AGENTS.md`](../AGENTS.md)).

## Environnement

- **Le port 4200 est le `ng serve` du propriétaire** ; ne pas le remplacer. Les E2E Playwright lancent leur propre serveur
  sur le port **4300** (`npx playwright test`).
- **Sa pile Docker** (`erp-rh-*`, ports 5000–5002) est son environnement : ne pas l'arrêter ni la modifier. Pour essayer une
  migration sur de vraies données : copier la base dans une base jetable (`pg_dump | psql` dans le conteneur postgres),
  puis la supprimer.
- **Tests backend** : `./mvnw -B -o test` ; les tests d'intégration démarrent leur propre PostgreSQL (Testcontainers, Docker
  doit tourner). Définir localement les variables d'environnement du backend requises (`JWT_SECRET`, `FRONTEND_URL`,
  `COOKIE_SECURE`, `ADMIN_*`, `SMTP_*`, `MAIL_FROM`, `CHANTIER_SYNC_BASE_URL`). JDK 21 : `C:\Program Files\Java\jdk-21`.
- **Tests frontend** : `npm test` (navigateur ChromiumHeadless) ; un sous-ensemble avec
  `npx ng test --watch=false --browsers=ChromiumHeadless --include='src/app/…/*.spec.ts'` ; contrôle de types rapide
  `npx ngc -p tsconfig.app.json --noEmit`.
- **E2E instables sous charge** : avec 4 workers, quelques tests (écrans d'administration, axe des Fonctions) dépassent
  30 s pendant que `ng serve` compile à froid. Relancer avec `--workers=1` avant de soupçonner une régression.
- **Contrôles locaux avant la CI (KAN-209)** : l'outil est `pre-commit`, configuré dans `.pre-commit-config.yaml` et installé par
  le groupe `dev` de `ia/`. Une fois par clone : `uv run --project ia pre-commit install --hook-type pre-commit --hook-type pre-push`.
  À chaque commit : ruff (lint et format) de `ia/`, faits documentation/code, domaines. À chaque push : pyright, pytest `ia/`
  et eslint du frontend. Tout lancer à la demande : `uv run --project ia pre-commit run --all-files --hook-stage pre-push`.
  Un test instable est corrigé à sa cause ou mis en quarantaine par ticket, jamais relancé jusqu'à ce qu'il passe.
- Les fichiers du dépôt sont en partie en CRLF : normaliser avant un remplacement de texte par script.
- **Pièges de code connus** : Java **21** dans le `pom.xml` ; pas de `${VAR:defaut}` dans les `yml` ; toute méthode
  d'écriture d'un service porte `@AuditableAction` (test d'architecture) ; une migration qui modifie des données auditées
  suit le gabarit de [`conventions/database.md`](../conventions/database.md) ; `EndpointSecurityTest` tient la table de
  référence des permissions de chaque route (la compléter pour toute nouvelle route).

## Décisions durables du propriétaire

- **Carte** : **gratuité absolue**, sans rien payer ni maintenant ni plus tard, même en pic ; le monde entier ; lancement
  possible par `docker compose` **et** par `ng s` (jonction `frontend/carte-fond` → `../carte-fond`, voir
  [`chantier/carte.md`](chantier/carte.md)). La clé ArcGIS (`ARCGIS_API_KEY`) expire au plus tard un an après sa création.
- **Employés** ([ADR 0010](adr/0010-employe-etat-du-dernier-mois-de-paie.md)) : la fiche est l'état du **dernier mois de
  paie importé** ; l'historique se calcule depuis les bulletins ; l'import de la paie n'accepte que le **mois qui suit
  exactement** le dernier ; un fichier ne s'importe que s'il concorde avec les fiches ; **salaire à 0 = erreur du
  fichier** ; départs (STC, absents) tous cochés, motif obligatoire ; le salaire est réservé à `PAIE_READ`.
- **Vocabulaire** : jamais « actif / inactif » dans l'interface — « En poste / Sorti » pour un employé, « En cours /
  Clôturé » pour un chantier ; l'interface dit « bulletins de paie ». Un chantier clôturé est refusé par l'import de la
  paie jusqu'à ce qu'on le rouvre (bouton dans l'assistant).
- **Tranches de l'Analytique des employés** : âge < 25, 25-34, 35-44, 45-54, 55+ ; ancienneté < 1 an, 1-3, 3-5, 5-10, 10+.
- **Cartes de tous les modules** : parcours guidé selon la hiérarchie déclarée par le domaine et accès à la liste à tout
  moment ; Analytique graphique avec ordre de priorité et libellés configurés par domaine. Coque, Tabulaire, Cartes et
  Analytique sont partagés ; filtres et règles métier restent propres à chaque domaine
  ([`conventions/frontend.md`](../conventions/frontend.md), [ADR 0014](adr/0014-vues-partagees-parcours-metier-configurables.md)).
- Tout se règle sur la **dernière paie importée**, quel que soit l'état de la base : ne pas redemander si la production a
  les mêmes données que le développement.
- **Déploiement** : sauvegarde chiffrée avec `age` avant toute mise à jour (voir [`deployment.md`](deployment.md)), puis
  `docker compose pull` et `docker compose up -d` ; la migration PostgreSQL 17 → 18 en production suit cette procédure
  avec sauvegarde et répétition.
