# Handoff — état du projet ERP-RH

Dernière mise à jour : 2026-10-25 (routine commune à Claude et Codex ; CI sur demande explicite).

**Relais Claude / Codex** : `CLAUDE.md` renvoie à `AGENTS.md` et à la
[routine commune](../../conventions/workflow.md). Le lot de continuité entre assistants et la règle
CI sont définis dans les conventions. Le propriétaire a demandé la revue locale des trois domaines
Équipe, Fonction et Chantier, puis leur livraison dans `main` par PR après validation.
Le lot harmonise les sélecteurs, la navigation et les synthèses Chantier sur la paie récente.
Les README et skills de chaque domaine décrivent les règles courantes.

**Chantier IA (2026-10-24)** : décisions prises (tranche verticale, service IA Python, LiteLLM,
sécurité par fiche de poste, premier cas « questions et vues pilotées »). Seule la preuve MCP
existe, en profil de test isolé ; aucune route MCP métier ni livraison IA. Tout le chantier est
suivi dans un seul document : [ia.md](../ia.md). Prochaine action : jalon J1.

Ce document dit **où en est le projet, comment le propriétaire veut travailler et ce qui reste ouvert**. Il ne remplace ni
`AGENTS.md`, ni `conventions/` (source de vérité), ni `TODO.md` (liste vivante des sujets) : il y renvoie.

---

## 1. Par où commencer

1. `AGENTS.md`, puis les conventions dans l'ordre qu'il donne.
2. `docs/README.md` (index de la documentation) et le README du domaine touché (`docs/<domaine>/README.md`).
3. Les décisions récentes d'architecture :
   [ADR 0009 — carte : satellite, relief et 3D](../adr/0009-carte-satellite-relief-3d.md),
   [ADR 0010 — la fiche employé porte l'état du dernier mois de paie](../adr/0010-employe-etat-du-dernier-mois-de-paie.md) et
   [ADR 0011 — Cartes et Analytique partagées par périmètre](../adr/0011-vues-cartes-analytique-par-perimetre.md),
   [ADR 0012 — coque et Tabulaire partagés](../adr/0012-coque-et-tabulaire-partages.md),
   [ADR 0014 — parcours métier configurables dans les vues partagées](../adr/0014-vues-partagees-parcours-metier-configurables.md).
   Le cadrage par domaine suit le [PV N°1 — ERP-RH](pv-n1-erp-rh.md)
   (projet à valider par le propriétaire avant diffusion).
4. `TODO.md` pour les sujets ouverts.

---

## 2. Travail récent livré

| Date | Domaine / lot | Contenu |
|---|---|---|
| 2026-10-18 | Carte | **Carte des chantiers** « niveau Google Maps » : monde en globe, relief et terrain 3D, bâtiments 3D, satellite Esri via une clé ArcGIS gratuite et obligatoire, avec secours automatique. Fond auto-hébergé dans `carte-fond/` à côté de `docker-compose.yml`. Voir `docs/chantier/carte.md`. |
| 2026-10-19 | Employés | **Employés en cinq lots** : (1) coque à onglets Tabulaire / Cartes / Analytique, filtres dans l'URL ; (2) fiche = état du dernier mois de paie (équipe, salaire et type, table `employe_sortie`, reprise **V30**) ; (3) **assistant d'import de la paie** (analyse, corrections des fiches, départs) ; (4) fiche et **parcours** de l'employé ; (5) vues **Cartes** et **Analytique**. Voir `docs/employee/README.md` et `docs/paie/README.md`, « Import Excel (assistant) ». |

| 2026-10-20 | Vocabulaire RH | L'interface dit « En poste / Sorti » pour les employés et « En cours / Clôturé » pour les chantiers (API et base inchangées : `ACTIF`/`INACTIF`, `actif`) ; boutons **Clôturer / Rouvrir** sur la liste et la fiche d'un chantier ; l'assistant d'import de la paie signale à part un chantier clôturé et propose de le rouvrir ; migration **V31** : supprime les fonctions sans bulletin ni fiche, clôture les chantiers sans bulletin (sur la base de développement : 48 fonctions, 183 chantiers, 29 restent en cours). |

| 2026-10-23 | Équipe | Référentiel d'équipes, trois vues partagées et import Excel; les règles et scénarios actuels sont centralisés dans [le dossier Équipe](../equipe/README.md). |
| 2026-10-24 | Équipe et Chantier | Les trois vues Équipe partagent un indicateur de qualité des rattachements alimenté par la dernière paie; « Orphelins » n'apparaît que si le compte est positif. La répartition Analytique inclut les bulletins sans équipe. La migration V35 clôture les chantiers absents de la dernière période de paie, avec audit; sans paie, elle ne change rien. |
| 2026-10-23 | Fonction | Trois vues, import et création dans l'en-tête; répartition par fonction porte les STC (`stc`, `stcMontant`). Les règles métier sont dans [le dossier Fonction](../function/README.md). |
| 2026-10-23 | Vues partagées et Chantier | Coque, Tabulaire, Cartes et Analytique partagés par les cinq domaines. Chaque domaine configure sa hiérarchie Cartes et l'ordre de priorité Analytique; filtres, données, colonnes, cellules, actions et règles métier restent propres au domaine. Voir [les vues de périmètre](../frontend/vues-perimetre.md). |

Les composants transverses sont décrits dans `docs/frontend/vues-perimetre.md` et `docs/frontend/README.md`. Chaque dossier
de domaine reste la source de ses règles, parcours et tests. Les preuves locales sont consignées avec le domaine concerné;
elles ne prouvent pas à elles seules un déploiement ni un accord métier.

---

## 3. Déploiement en cours

- **Sauvegarde faite** le 2026-10-19 avant la mise à jour : `rh-erp-20261019T152826Z.tar.gz.age` (serveur, `./backups/`),
  contrôles d'intégrité OK. Elle est chiffrée avec `age` ; la clé privée est hors serveur (voir `docs/deployment.md`).
- **À faire par le propriétaire** : `docker compose pull` puis `docker compose up -d`. Si elles ne sont pas déjà appliquées,
  Flyway exécute **V29–V35** : colonnes Employé et départs; reprise des fiches depuis la dernière paie (V30); nettoyage des
  référentiels (V31); permission d'import Équipe (V32); retrait des affectations des employés sortis (V33); fusion de
  `CH+OP` (V34); clôture des chantiers absents de la dernière paie (V35). Les reprises de données sont auditées; sauvegarder
  la base avant application.
- **Ensuite** : essayer l'assistant d'import avec le vrai fichier de paie d'**octobre 2026** (premier vrai usage).

---

## 4. Règles du propriétaire (à respecter sans les redemander)

**Façon de travailler**
- Appliquer la [routine de travail et de livraison](../../conventions/workflow.md), référencée dans
  `AGENTS.md` : elle centralise les consignes de cadrage, d'autonomie, de vérification à l'écran,
  de documentation et de livraison. Les décisions métier ci-dessous restent propres au projet.

**Décisions déjà prises**
- Carte : **gratuité absolue**, sans rien payer ni maintenant ni plus tard, même en pic ; le monde entier ; lancement possible
  par `docker compose` **et** par `ng s` (jonction `frontend/carte-fond` → `../carte-fond`, voir `docs/chantier/carte.md`).
- Employés (ADR 0010) : la fiche est l'état du **dernier mois de paie importé** ; l'historique se calcule depuis les bulletins ;
  l'import de la paie n'accepte que le **mois qui suit exactement** le dernier ; un fichier ne s'importe que s'il concorde avec
  les fiches (pas de bulletin qui diverge de la fiche) ; **salaire à 0 = erreur du fichier** ; départs (STC, absents) tous
  cochés, motif obligatoire ; le salaire est réservé à `PAIE_READ`.
- Vocabulaire (2026-10-19) : jamais « actif / inactif » dans l'interface — « En poste / Sorti » pour un employé, « En cours / Clôturé »
  pour un chantier. Un chantier clôturé est refusé par l'import de la paie jusqu'à ce qu'on le rouvre (bouton dans l'assistant).
- Tranches de l'Analytique des employés : âge < 25, 25-34, 35-44, 45-54, 55+ ; ancienneté < 1 an, 1-3, 3-5, 5-10, 10+.
- Cartes de **tous les modules** : parcours guidé selon la hiérarchie déclarée par le domaine et accès à la liste à tout moment ;
  Analytique graphique (paie et fiches Employé), avec ordre de priorité et libellés configurés par domaine. Coque, Tabulaire,
  Cartes et Analytique sont partagés ; les filtres et règles métier restent propres à chaque domaine (`conventions/frontend.md`, ADR 0014).
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
  doit tourner). Définir les variables d'environnement du backend requises localement (`JWT_SECRET`, `FRONTEND_URL`,
  `COOKIE_SECURE`, `ADMIN_*`, `SMTP_*`, `MAIL_FROM`, `CHANTIER_SYNC_BASE_URL`).
- **Tests frontend** : `npm test` (navigateur ChromiumHeadless) ; un sous-ensemble avec
  `npx ng test --watch=false --browsers=ChromiumHeadless --include='src/app/…/*.spec.ts'` ; contrôle de types rapide
  `npx ngc -p tsconfig.app.json --noEmit`.
- **E2E instables sous charge** : avec 4 workers, quelques tests (écrans d'administration, axe des Fonctions) dépassent les
  30 s pendant que `ng serve` compile à froid. Relancer avec `--workers=1` avant de soupçonner une régression.
- Les fichiers du dépôt sont en partie en CRLF : normaliser avant un remplacement de texte par script.
- Pièges de code connus : Java **21** dans le `pom.xml` actuel (ancienne mention Java17 obsolète) ; pas de `${VAR:defaut}` dans les `yml` ; toute
  méthode d'écriture d'un service porte `@AuditableAction` (test d'architecture) ; une migration qui modifie des données
  auditées suit le gabarit de `conventions/database.md` ; `EndpointSecurityTest` tient la table de référence des permissions
  de chaque route (la compléter pour toute nouvelle route).

---

## 6. Sujets ouverts

Le détail transversal est dans `TODO.md`; les tâches propres à un domaine sont dans `docs/<domaine>/TODO.md` lorsqu'un suivi opérationnel est ouvert. Pour Équipe, les règles, les décisions confirmées et la couverture de test sont regroupées dans [le README du domaine](../equipe/README.md). La revue locale des parcours est terminée; la préparation d'une présentation et d'une vidéo de formation reste différée et figure dans le TODO global. Aucun TODO de réalisation n'est ouvert pour le domaine. Principaux sujets :

- **Assistant d'import** : premier usage réel sur le fichier d'octobre 2026, à suivre.
- **Stabilisation** : revue propriétaire des domaines dans l'ordre indiqué, puis consignation des remarques dans le PV global avant diffusion; les quasi-doublons de fonctions restent dans « Qualité des données ».
- **Qualité des données** (« Prochaine tâche ») : tous les champs obligatoires et aucun doublon, dans tous les domaines.
- **Conformité backend** (`docs/conformite/README.md`) : G3 (paramètres métier administrables), G5, G6, G10 en attente de
  décision ; la migration **PostgreSQL 17 → 18 en production** est à faire en tout dernier, avec sauvegarde et répétition.
- **Carte** : recherche de lieux reportée ; la clé ArcGIS (`ARCGIS_API_KEY`) expire au plus tard un an après sa création.
- **Domaines à venir** : Pointage, puis paie calculée depuis le Pointage (section « Évolutions prochaines »).
