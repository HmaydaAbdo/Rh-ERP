# TODO — points ouverts

> Suivi des sujets encore à traiter. Les sujets livrés et vérifiés dans le code (imports atomiques,
> PostgreSQL + Flyway, JWT/RBAC et sécurité, déploiement Docker + CI, synchronisation chantiers, rapport
> PDF en HTML, domaine Équipe, tableaux, etc.) ont été retirés de ce fichier : leur description détaillée
> vit dans `docs/` et leur historique dans git.

---

## Évolutions IA et KPI

Les conventions racine constituent le blueprint réutilisable ; l'ADR historique et les skills IA métier sont dans
`docs/adr/0001-adoption-socle-staport.md` et `docs/<domaine>/skills/`. Java 21 est aligné dans Maven ;
la migration PostgreSQL 18 est validée en local le 2026-10-10. **Frontend (2026-10-10)** : Angular 22.2.2, kit Staport sur
Angular Aria/CDK + Lucide + Tailwind 4, PrimeNG/PrimeIcons/Zone.js/Karma retirés, tests Vitest (653, couverture complète) et E2E Playwright + axe (39),
audit npm sans aucune vulnérabilité, licences contrôlées et SBOM en CI.
Restent à faire :

### Chantier séparé — appliquer les concepts IA, Agent UI, MCP et RAG à ERP-RH

Ce chantier est distinct de l'audit des conventions actuellement en cours. Il vise à étudier puis
intégrer ces capacités dans l'application à partir de besoins RH concrets.

**Terrain préparé (2026-10-18)** : le socle cible est fixé par l'[ADR 0008](docs/adr/0008-plateforme-ia-passerelle-agents-memoire-graphrag.md)
et les conventions `agents-ia.md`, `rag.md`, `mcp.md`, `database.md`, `testing.md` : passerelle LiteLLM (alias,
bascule entre offres gratuites, budgets), agents de domaine sous un superviseur, mémoire courte/compactée/longue,
pgvector puis GraphRAG Neo4j si l'évaluation le justifie, serveur MCP Spring AI, A2A entre applications. Aucun
code ni dépendance n'est ajouté ; les versions seront vérifiées au premier cas d'usage. Données actuelles : fictives.

1. **Préparer les données et le besoin** : instrumenter le catalogue de KPI existant, puis choisir
   avec la RH un premier cas d'usage, ses utilisateurs, ses données autorisées et le résultat attendu.
2. **Cadrer les quatre concepts** : déterminer le rôle d'un agent/modèle, la nécessité d'une
   interface AG-UI/A2UI, les outils MCP utiles (premier outil en lecture seule) et l'usage éventuel
   de RAG/pgvector. Pour chaque capacité, documenter le périmètre et la raison de l'inclure ou non.
3. **Valider l'architecture avant le code** : comparer les approches et faire valider le choix
   d'architecture avant d'introduire un nouveau composant, service, transport ou index.
4. **Implémenter par étapes** : relier chaque capacité retenue à une permission RBAC, une source de
   données autorisée, une trace d'audit appropriée et une interface compréhensible ; aucune
   connexion directe d'un modèle à la base métier.
5. **Vérifier avant livraison** : tests de contrat et de permissions, provenance des réponses,
   absence de fuite de données, résistance aux entrées hostiles, comportement en cas d'indisponibilité,
   puis mesures de latence et de coût. Garder les fonctionnalités non validées hors production.

Les validations d'exploitation restent regroupées ci-dessous dans **Travail côté serveur**.

Ne pas basculer une dépendance majeure ou un volume de base sans validation de compatibilité, tests
et procédure de retour arrière propres à cette étape.

## Carte des chantiers (MapLibre, fond auto-hébergé, Maroc)

Carte en lecture seule pour la direction, centrée et bornée sur le Maroc, avec ses propres permissions et son
propre rôle. Uniquement des solutions gratuites et open source (règle du projet). Livrée par étapes — voir
[docs/chantier/carte.md](docs/chantier/carte.md) et l'[ADR 0007](docs/adr/0007-maplibre-protomaps-auto-heberge.md) :

1. **Fait (2026-10-17)** : moteur MapLibre GL JS, `pmtiles` et styles Protomaps ; compatibilité vérifiée (Angular 22,
   TS 6, zoneless, WebGL en test, build, audit, licences). OpenLayers retiré (ADR 0006 remplacé).
2. **Fait (2026-10-17, validé en production)** : configuration du fond auto-hébergé (`CARTE_CONFIG`), thème clair/sombre,
   emprise du Maroc calculée depuis la frontière Natural Earth ; script `scripts/carte/preparer-fond-maroc.sh`, montage
   `CARTE_FOND_DIR`, type MIME `.mjs` dans nginx. Fond du 2026-10-16 (545 Mo) servi en production, requêtes `Range`
   validées à travers les deux nginx. **À faire** : voir le rendu à l'écran avec la page ; faire confirmer le périmètre
   (provinces du Sud comprises) par la direction.
2 bis. **Fait (2026-10-18)** : permission `CARTE_READ` et rôle `DIRECTION` (migration V28) ; `PAIE_MANAGER` ne l'a pas —
   voir [docs/rbac/carte.md](docs/rbac/carte.md).
3. Contrat de données `ChantierCarte` (position et tracé optionnels), interface `ChantierCarteSource` et source de
   démonstration clairement marquée. Les champs métier absents de la base (type, montant, santé…) ne sont pas affichés
   tant qu'ils ne sont pas gérés.
4. Composant carte « bête » (marqueurs, regroupement, sélection, redimensionnement, destruction, rendu des noms arabes à confirmer à
   l'écran, état d'erreur si le fond manque) et panneau « À localiser ».
5. Page complète (indicateurs, légende, filtres).
5 bis. **Fait (2026-10-18)** : page minimale `/carte` protégée par `CARTE_READ`, entrée de menu « Carte », composant carte sans donnée.
5 ter. **Fait (2026-10-18)** : carte « niveau Google Maps » — le monde entier en globe (Maroc détaillé jusqu'au bâtiment),
   zoom 19, bâtiments 3D, relief Mapterhorn auto-hébergé (ombrage et terrain 3D), calques Plan / Satellite / Relief,
   imagerie Esri relayée par nginx avec la clé ArcGIS côté serveur, vue 3D, boussole, position, plein écran, échelle, fiche
   d'un lieu ([ADR 0009](docs/adr/0009-carte-satellite-relief-3d.md)). **En production** : créer la clé ArcGIS gratuite et la
   mettre dans `.env` (`ARCGIS_API_KEY`, pas à pas dans docs/chantier/carte.md) ; relancer
   `scripts/carte/preparer-fond-carte.sh` (environ 40 Go au zoom 13, prévoir le double pendant la préparation) ; déployer
   la nouvelle image du frontend. **Reste** : recherche de lieux (reportée) ; renouveler la clé ArcGIS avant son échéance.
   À vérifier en production : rendu du fond à l'écran (clair/sombre, téléphone), noms arabes.

## Vues Cartes, Tabulaire et Analytique

- **Fait (2026-10-17) — domaine Paie** : les vues Tabulaire, Cartes et Analytique sont livrées sous une coque commune
  (`portail/paie/vues/`, sélecteur de vue, actions dans l'en-tête), avec filtres et navigation cohérents entre les niveaux.
- **En cours (2026-10-18) — domaine Employés** : plan validé en 5 lots. Lot 1 fait : sélecteur de vue extrait dans
  `shared/components/vue-switcher/` (Paie l'utilise), coque `portail/employee/vues/` (titre, actions, barre de filtres dans
  l'URL) et vue Tabulaire. Lot 2 fait : fiche = état du dernier mois de paie (équipe, salaire et type, réservés à
  `PAIE_READ`), table `employe_sortie`, reprise V30 (ADR 0010). **À vérifier avant le déploiement** : sauvegarde de la base
  de production (V30 supprime les employés sans aucun bulletin). Restent : 3. assistant d'import de la paie en
  boucle (écarts avec la base, CIN inconnu créé sur place, sorties confirmées, mois suivant uniquement) ; 4. fiche et parcours
  de l'employé ; 5. Cartes et Analytique des employés.
- **À faire — autres domaines** : pour **Chantiers, Fonctions et Équipes**, seule la vue tabulaire existe encore.
  Les anciens composants vides (« disponible prochainement »), sans route ni onglet, ont été retirés pendant la revue de
  conformité ; aucun parcours utilisateur n'y était relié.

Pour chaque domaine restant : concevoir et coder le contenu des vues Cartes et Analytique (avec leurs tests) ; ajouter une
coque commune sur le modèle de `PaieVuesComponent` (titre, onglets de vue au même niveau que les actions déjà dans l'en-tête,
filtres) ; déclarer les routes `cartes` et `analytique` dans `<domaine>.routes.ts` avec la permission de lecture ; documenter
dans `docs/<domaine>/README.md`.

---

## Prochaine tâche — Qualité des données (une seule tâche, tous les domaines)

**Règles voulues (2026-10-03)** : dans **tous** les domaines, **tous les champs sont obligatoires** et
**aucun doublon ne peut exister**. À vérifier domaine par domaine (Employé, Chantier, Fonction, Équipe,
Paie, Utilisateur, Rôle), à quatre niveaux — base (`NOT NULL`, contraintes `UNIQUE`), API (validation des
DTO et contrôle d'unicité dans les services, insensible à la casse et aux espaces), interface (champs
marqués obligatoires) et imports Excel (ligne rejetée si champ manquant ou doublon) — puis sur les
**données existantes** (champs vides, doublons), avec correction par migration Flyway.

À instruire dans cette tâche :

- **V27 — unicité normalisée** : appliquée en production le 2026-10-16. Le doublon exact du
  libellé Fonction a été résolu dans l'application avec audit : la Fonction 144 (espace initial,
  aucune référence active) a été supprimée et la Fonction 148 (référencée) conservée. Flyway a
  appliqué V22 à V27 et le backend a démarré sainement avec validation du schéma. Les contraintes
  `CHECK NOT VALID` bloquent les nouvelles valeurs entourées d'espaces ; les anciennes valeurs
  restent à inventorier et nettoyer avant validation complète des contraintes. Le doublon apparent
  `C157A` ci-dessous reste à instruire séparément.

- **Champs aujourd'hui facultatifs** à trancher un par un : pour Paie `equipe` (340 bulletins sans
  équipe en base), `observation`, jours de récupération, primes ; pour Chantier `nom` et `designation` ;
  pour Utilisateur `employeeId`. « Tous obligatoires » est-il voulu pour chacun (ex. une prime à 0 est-elle
  une saisie) ?
- **Nettoyer les doublons du référentiel Fonction** : 114 fonctions dont 9 paires très proches (fautes de
  frappe), toutes utilisées — la fusion (libellé à garder, rattachement des employés et bulletins) est une
  décision métier : `RESPONSABLE EPLOITATION FLOTTE CAMION` / `RESPONSABLE EXPLOITATION FLOTTE CAMION`,
  `OP. COMPACTEUR ENROBE` / `OP. COMPCTEUR ENROBE`, `OP. AOUTOBETONNIERE` / `OP. AUTOBETONNIERE`,
  `OP. TRACTOPEDLLE` / `OP. TRACTOPELLE` / `OP. TRACTIPELLE`, `TECHNICIEN DE QUALITE` /
  `THECNICIEN DE QUALITE` (`CH. CAMION` / `CH. CAMION SR` et `OP. COMPACTEUR` / `OP. MINI COMPACTEUR`
  sont probablement distinctes).
- **Vérifier le doublon apparent du chantier `C157A`** : il apparaît deux fois dans le filtre Chantiers
  « Tous les mois » avec deux options distinctes. Confirmer s'il s'agit de deux enregistrements en base,
  puis décider avec la RH s'il faut corriger les données ou différencier les libellés.
- **Libellés des équipes `A`, `LABO`, `ASPHALET`, `8`** (créées avec libellé = code le 2026-10-03) : à
  compléter avec la RH via l'écran Équipes.
- **Traiter les quasi-doublons sémantiques à la saisie** (ex. fonction « TECHNICIEN DE QUALITE » vs
  « THECNICIEN DE QUALITE ») : la normalisation trim/casse de V27 ne détecte pas les fautes de frappe ;
  toute fusion ou règle de similarité doit être instruite avec la RH.

---

## Travail côté serveur

À traiter lors d'interventions autorisées sur l'hôte de production. Vérifier les sauvegardes et les
procédures propres à chaque opération dans `docs/deployment.md` avant toute action.

1. **Finaliser la confiance du proxy en production** : le 2026-10-17, les journaux ont confirmé
   `socket_peer=172.20.0.1` pour les requêtes utilisateur et `127.0.0.1` pour le healthcheck ; le
   réseau `erp-rh_web-net` est `172.20.0.0/16` (passerelle `.1`) et `erp-rh_db-net` est
   `172.21.0.0/16` (passerelle `.1`). Déployer la configuration `set_real_ip_from 172.20.0.1/32`, puis
   vérifier la résistance aux en-têtes falsifiés ainsi que l'application effective des
   limites par IP/utilisateur. Vérifier aussi que le secret JWT est unique à la production sans jamais
   l'afficher ; sa valeur actuelle décode à au moins 256 bits.
2. **Mettre l'accès ERP en HTTPS** (session dédiée) : déterminer l'URL publique et le point de terminaison
   TLS, configurer le certificat et le listener Nginx, puis vérifier la redirection HTTP→HTTPS, le
   sous-chemin `/erp-rh/`, les cookies sécurisés, CORS et le renouvellement du certificat. La config
   Nginx actuelle ne montre que HTTP/80 ; ne pas modifier le serveur avant de confirmer le nom public
   et la méthode d'obtention/renouvellement du certificat.
3. **Raccorder la supervision métrique en production** (session dédiée) : configurer un collecteur Prometheus privé
   pour `/actuator/prometheus` et choisir sa rétention. Créer un tableau de bord de disponibilité,
   débit et latence HTTP, d'échecs d'audit et de ses jauges d'intégrité, ainsi que des succès,
   échecs, lignes ignorées et durées de synchronisation des chantiers. Définir les alertes avec un
   seuil, une durée, un responsable et une action : intégrité d'audit `> 0` pendant 1 minute ; nouvel
   échec d'écriture d'audit dans une fenêtre de 5 minutes ; nouvel échec de synchronisation dans une
   fenêtre de 15 minutes ; sauvegarde unhealthy ou archive de plus de 24 heures. Confirmer ces seuils
   avec l'exploitation, tester la collecte et le routage des alertes avant la mise en service.

Le propriétaire n'utilisera pas SSH. Le CD manuel a été confirmé le 2026-10-16 : aucun staging ni
déploiement GitHub Actions vers le serveur. La production utilisera `latest` pour les quatre images
après réussite de la CI sur `main` (voir [ADR 0004](docs/adr/0004-production-latest-tag.md)). Pour
inclure automatiquement les services de sauvegarde et de rétention pgAudit, le `.env` de production doit contenir
`COMPOSE_PROFILES=backup`. La revue de l'extrait Nginx outer a été faite ; les contrôles restants sont
détaillés ci-dessus.

## Performance — arbitrages et mesures à terminer

Le contrôle du dépôt est conforme à 100 % : le profil PostgreSQL synthétique possède une porte CI
obligatoire et le CI #38715644287 l'a passé. Cela ne valide pas les capacités de l'hôte de production.
Pour compléter la validation opérationnelle :

- rejouer le profil à 20 échantillons par opération lourde sur un hôte représentatif et comparer les
  ressources aux capacités réservées ;
- mesurer les parcours HTTP de bout en bout avec sérialisation et proxy nginx outer ;
- vérifier les délais et comportements d'échec face à PostgreSQL, l'ERP et le fournisseur SMTP réels.

Le pool SMTP et les délais 5/3/5 s sont configurés, le rejet en saturation et la réponse générique
sont couverts par test ; `nginx -t` réussit dans l'image Nginx du projet. La conformité de code et
les mesures locales sont vérifiées ; elles ne démontrent ni la disponibilité des services réels ni
la capacité de production.

## Évolutions prochaines

### Domaines restants
- **Pointage** : à construire, en passant par les façades `IEmployeeService` (et probablement
  `IPaieService`), jamais par leurs Repository.
- **Paie calculée depuis le Pointage** (décision du 2026-09-22) : à terme plus d'import ni de saisie de la
  paie, calcul automatique à la validation du Pointage ; `PaieImportService`, le contrôleur d'import et le
  bouton « Importer » seraient alors retirés.
- **Statuts provisoire / validé** pour Pointage et Paie (décision du 2026-09-22) : provisoire (éditable)
  puis validé (figé) ; un mois ne peut être saisi que si le précédent est validé (progression
  séquentielle). Machine à états et validation d'enchaînement à concevoir le moment venu.
