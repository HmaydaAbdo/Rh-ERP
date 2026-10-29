# Handoff — état du projet ERP-RH

Dernière mise à jour : 2026-10-29 (routine commune à Claude et Codex ; CI sur demande explicite).

**V1c en diagnostic (2026-10-28)** : dernier jeu complet conservé dans
`backend/target/evaluation-ia-avant-correctifs.json` : 13/24, dix pannes JSON et une réponse vide.
Une reproduction avec trace localise la panne JSON dans le sélecteur officiel LangChain, au parsing de sa sortie.
Les plafonds applicatifs de génération de 300 et 1 500 tokens sont retirés sur demande du propriétaire ;
les limites natives des modèles restent applicables. Validation réelle après retrait et clôture V1c encore attendues.

**Relais Claude / Codex** : `CLAUDE.md` renvoie à `AGENTS.md` et à la
[routine commune](../../conventions/workflow.md). Le lot de continuité entre assistants et la règle
CI sont définis dans les conventions. Après Équipe, Fonction et Chantier, la revue technique couvre
Employé, Paie, Rapport, Auth, Paramètres et Audit. Les validations des imports et formulaires,
les lectures autorisées des rôles, les reprises après erreur, les sources analytiques et les exports
individuels sont alignés sur leurs contrats documentés. Les README et skills de chaque domaine
décrivent les règles courantes; le PV global garde les accords métier à recueillir avant diffusion.

**Qualification Chantier (2026-10-26)** : lot local isolé `codex/chantier-localisation`, migrations V37/V38, six natures et
source cartographique réelle. La reprise du classeur conserve huit exclusions d'affichage. Contrat dans le
[README](../chantier/README.md) ; preuves et statut de livraison dans le
[relais technique](chantier-localisation-2026-10-26.md). Livraison par PR vers `main` demandée le 2026-10-27 ; le déploiement reste distinct.

**Thème sombre et carte Chantier** : les tokens globaux utilisent Graphite Staport (noir mat, surfaces graphite, actions et focus
bleus, accent cuivre rare) ; le thème clair, les statuts et les couleurs sémantiques des graphiques restent inchangés. La carte
propose une barre unique de recherche code/nom et Nature, des commandes verticales transparentes, des icônes bleues et des
marqueurs cuivre. Elle recadre les sites au chargement et après validation du filtre, garde la vue en l'absence de résultats,
et ne réagit pas aux déplacements manuels. Le build Angular de production passe avec l'avertissement de budget du bundle
initial et les deux avertissements CommonJS CopilotKit décrits dans le bilan local. La revue navigateur sur grand écran
est confirmée ; le viewport mobile n'a pas pu être vérifié avec le Chrome connecté dans ce tour.

**Navigation de la carte et menu latéral** : Fonctions et Équipes ont des entrées séparées ; les destinations du menu
ont chacune une icône dédiée et « Heures sup. » est le libellé compact. Sur `/carte` en grand écran, le rail est remplacé
par un hamburger à côté du filtre, avec les outils carte alignés dessous, et un volet animé au survol/focus, replié à la sortie. Téléphone et tablette conservent
le tiroir standard. Le mouvement respecte `prefers-reduced-motion`.
La revue navigateur sur grand écran confirme le menu replié/ouvert, le retour au sidebar standard hors carte et la barre
filtre-outils ; le viewport mobile n'a pas pu être vérifié. `/carte` occupe déjà la page entière : aucun bouton de plein
écran natif supplémentaire n'est nécessaire. Le cadrage Maroc est posé à la création puis remplacé au chargement par le
cadrage des chantiers visibles. Une tuile de Marrakech contient des routes nommées ; les noms secondaires apparaissent dès z14 et les routes nommées restent consultables au clic lorsque leur étiquette est masquée pour éviter les chevauchements. Les commerces usuels sont masqués. Le script prépare le monde jusqu'à z13 par défaut et le Maroc jusqu'à z15 ; l'archive examinée présente des tuiles échantillonnées jusqu'à z11 hors du Maroc. Le zoom caméra maximal 19 n'ajoute pas de détails aux tuiles au-delà de leur couverture. Les données du conteneur étant celles de production, aucune donnée ni aucun volume n'a été modifié. La production a bien chargé `/carte` après connexion et affiche la version antérieure du menu et des filtres avec 19 sites ; ce n'est pas la branche courante. La prévisualisation de la branche n'a pas atteint l'état prêt (le démarrage en arrière-plan a arrêté le service esbuild et le démarrage au premier plan a été interrompu pendant le parcours de l'archive cartographique volumineuse). Le build Angular de production de la branche passe avec l'avertissement de budget initial (+22,63 Ko) et deux avertissements CommonJS CopilotKit. Les sources de données PK/PR du CNER et les limites d'accès sont décrites dans [carte.md](../chantier/carte.md).

**Heures supplémentaires (2026-10-28)** : PR #102 est fusionnée dans `main`. Le domaine inclut les façades métier,
les migrations V39/V40, l'import, les vues et ses outils MCP officiels Spring AI (`heures_supp_periodes`,
`heures_supp_import_prerequis`, `heures_supp_indicateurs`, `heures_supp_rechercher`). Cette reprise complète la couverture
par le précontrôle sans écriture et les filtres d'indicateurs ; les répartitions rendent tous les groupes autorisés sans troncature.
Les règles métier sont dans
[`docs/heures-supp/README.md`](../heures-supp/README.md).

**Chantier IA** : PR #98 et PR #104 sont fusionnées dans `main`. La PR #105 porte V1d/V1f et la reprise V1c sur
`claude/ia-v1d-v1f-comparer-sans-verificateur`. Elle est rebasée sur le `main` qui inclut PR #102 ;
les conflits du test du catalogue MCP, de ce relais et de [`ia.md`](../ia.md) sont résolus en conservant les
changements des deux côtés. Le run CI 40769132424 sur le commit 2073190 a identifié deux régressions de test : le client
MCP Python attendait 28 outils au lieu de 30, et Ruff demandait le formatage de `evaluation.py`. Le job full-stack a été
sauté car il dépend du backend en échec. Le contrat de catalogue, le formatage et le type optionnel du test AG-UI sont
corrigés localement ; Ruff, formatage, Pyright et le test Java qui lance le vrai client MCP Python passent. Nouvelle CI
à vérifier sur le prochain commit poussé. Le sélecteur et les outils restent ceux des frameworks officiels.

**V1d clôturée localement** : la comparaison et ses contrats sont déplacés vers la façade analytique publique de Paie ; l'adaptateur
MCP conserve validation des paramètres, RBAC, audit et présentation de la vue. La convention MCP fixe désormais cette
frontière pour tous les domaines : indicateurs et calculs métier relèvent de l'API publique du domaine propriétaire.
**Paie complétée localement** : `paie_mouvements` prend écart net et plus payés dans `IPaieEffectifsService` ;
`paie_repartition` délègue projection et tri à `IPaieAnalytiqueService` ; la sélection du mois dans les mouvements et la borne
de fin de l'évolution sont également portées par les façades Paie. Aucun plafond de résultats ou de pages MCP n'est appliqué.
**Employés complétés localement** : le tri métier des groupes et l'agrégation mensuelle des départs sont dans l'API Employés ;
le parcours complet est rendu par l'API Paie. Les recherches paginées restent accessibles jusqu'à leur total.
**Équipe, Fonction et Chantier audités** : leurs chiffres Cartes/Analytique sont des indicateurs de bulletin, déjà calculés
par Paie ; les regroupements de fiches relèvent de l'API Employés. Les API de ces trois domaines portent les référentiels
et fiches, sans agrégat métier distinct à déplacer ni outil MCP à dupliquer. Le code et la documentation sont terminés ;
la validation avant compléments Heures supplémentaires était à 561 tests. La validation complète actuelle après rebase et
compléments MCP passe : `mvnw -B -o test`, 588 tests, 0 échec, 0 erreur, 4 ignorés. Voir [ia.md](../ia.md).
Le `LLMToolSelectorMiddleware` officiel est maintenant construit systématiquement par l'application ; l'option
`IA_SELECTION_OUTILS` est supprimée.

V1d : `paie_comparer` compile et ses deux tests d'intégration passent (`McpOutilsLectureIntegrationTest#paie_comparer*`)
sur une base PostgreSQL 18.6 éphémère créée par Testcontainers, avec migrations Flyway V1–V38. Le JDK 21 utilisé est
`C:\Program Files\Java\jdk-21` ; l'avertissement JaCoCo de mismatch des classes est préexistant et n'empêche pas le succès.
V1f : le vérificateur, son état de flux et les textes associés sont retirés. La suite IA passe (50 tests, 13 ignorés selon
leurs conditions d'exécution) ; Ruff et formatage passent, Pyright rapporte 0 erreur ; les 3 E2E ciblés de l'assistant passent.
La première exécution Python bloquait dans le sandbox sur la socket locale d'asyncio ; elle passe hors sandbox avec la
carte locale LiteLLM, sans réseau. Relecture SQL en transaction read-only
de la base ERP locale : C206, août 2026 = 340 405,38 MAD (76 bulletins), septembre = 422 233,85 MAD (91 bulletins),
écart +81 828,47 MAD et +24,0 % arrondi ; l'exemple de référence est confirmé. Le sélecteur officiel est activé
systématiquement et `IA_SELECTION_OUTILS` n'est plus une option. Le commit initial `0f25c80b` a été poussé sur la PR #105 ;
la branche est rebasée sur le `main` incluant Heures supplémentaires et sera repoussée après les vérifications locales.
Aucun contrôle CI n'a été lancé manuellement. V1d et V1f sont clôturées dans ce lot, sous réserve de la CI et de la revue PR. Les audits Employés, Paie, Équipe, Fonction et Chantier sont terminés ;
la suite backend complète passe localement. **V1c est reprise** : le banc d'évaluation passe par la même fabrique que le
service en production (sélecteur et résumeur officiels) ; la suite IA complète passe à 50 tests, 13 ignorés. Ruff et
Pyright ciblés passent. Le run réel précédent avec trois KO précède cette correction et n'est pas une mesure valide ;
évaluation réelle étendue, latence et démonstration T20 restent ouvertes. Un nouveau run fournisseur attend la vérification
d'un quota réellement gratuit. Reprise du 2026-10-28 : LiteLLM 1.104.2 tourne localement ; deux smoke tests par tags ont
révélé que le pool demandé n'est pas respecté (`complex` → OpenRouter, en 429 ; `id:gemini-3.8-flash` → Ministral).
Le filtre officiel appelé directement avec le même tag choisit bien Gemini. Le garde-fou LiteLLM officiel en `pre_call`
crée un compartiment `litellm_metadata` distinct de `metadata`, ce qui masque les tags au routeur ; le défaut correspond
à [LiteLLM #45543](https://github.com/BerriAI/litellm/issues/45543), correctif proposé dans [#45585](https://github.com/BerriAI/litellm/pull/45585), encore ouvert. Le propriétaire a validé les groupes officiels par capacité le 2026-10-28 : configuration, client IA et permissions des clés ont été adaptés localement. `litellm-cles` synchronise désormais les groupes des clés existantes ; les cinq groupes de production excluent eval/test. Le garde-fou reste actif. LiteLLM 1.104.2 reste épinglé ; les versions officielles 1.106.5 et 1.109.0-dev.1 ne contiennent pas encore le correctif upstream, mais le choix du groupe par `model` évite le défaut de tags. Validation locale du 2026-10-28 : 11 tests IA ciblés réussis ; les cinq groupes répondent dans leur pool, OCR réel compris. Un ciblage individuel Groq20 réussit ; trois refus 403 confirment l'exclusion eval/test/selftest de la clé applicative. Une injection est bloquée en 400 ; la sonde de bascule et une bascule réelle du groupe complex réussissent. Un appel autorisé avec la clé applicative réussit. La resynchronisation des clés est idempotente. Ruff ciblé, compilation Python des scripts et validation Compose passent. V1c reste ouverte pour les évaluations métier, p95 et T20. Prochaine tâche : reprendre V1c ciblée, complète et T20. Le lot V1c reste distinct de la reprise de complétude MCP des outils Heures supplémentaires.

**Correctif OSV backend (2026-10-28)** : la dernière CI sur l'ancien head (`40773260886`) échouait au scan de dépendances,
qui trouvait `opentelemetry-api` 1.62.0 (GHSA-ccrj-gw8r-854m). Le POM importe désormais la BOM officielle OpenTelemetry
1.67.0 pour aligner tous ses artefacts sur la version corrigée. Reproduction locale du même OSV-Scanner v2.6.0 : aucun
problème sur le SBOM de production (235 composants) ; l'exception Guava demeure active et filtrée sur le SBOM MCP de test
(315 composants). Vérifications backend locales : Checkstyle, 588 tests (0 échec, 4 ignorés), couverture par domaine,
contrôle des dépendances runtime, documentation des permissions/outils MCP, client TypeScript (`typecheck` et audit npm),
interopérabilité MCP Java/TypeScript/Python et scan OSV des deux SBOM passent. Aucun run CI distant n'a été relancé.

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
- **Exploitation** : les décisions et contrôles restant à réaliser sont regroupés dans le TODO global;
  la migration **PostgreSQL 17 → 18 en production** suit la procédure de déploiement, avec sauvegarde et répétition.
- **Carte** : recherche de lieux reportée ; la clé ArcGIS (`ARCGIS_API_KEY`) expire au plus tard un an après sa création.
- **Domaines à venir** : Pointage, puis paie calculée depuis le Pointage (section « Évolutions prochaines »).
- **IA** : J2 (périmètres par fiche de poste, projection du salaire, budgets par poste) avant tout utilisateur non
  administrateur. Détail et journal dans [ia.md](../ia.md).
