# TODO — points ouverts

> Suivi des sujets encore à traiter. Les sujets livrés et vérifiés dans le code (imports atomiques,
> PostgreSQL + Flyway, JWT/RBAC et sécurité, déploiement Docker et contrôles automatisés, synchronisation chantiers, rapport
> PDF en HTML, domaine Équipe, tableaux, etc.) ont été retirés de ce fichier : leur description détaillée
> vit dans `docs/` et leur historique dans git.

---

## Évolutions IA et KPI

Les conventions racine constituent le blueprint réutilisable ; l'ADR historique et les skills IA métier sont dans
`docs/adr/0001-adoption-socle-staport.md` et `docs/<domaine>/skills/`. Java 21 est aligné dans Maven ;
la migration PostgreSQL 18 est validée en local le 2026-10-10. **Frontend (2026-10-10)** : Angular 22.2.2, kit Staport sur
Angular Aria/CDK + Lucide + Tailwind 4, PrimeNG/PrimeIcons/Zone.js/Karma retirés, tests Vitest (653, couverture complète) et E2E Playwright + axe (39),
audit npm sans aucune vulnérabilité, licences contrôlées et SBOM produits par les contrôles automatisés.
Restent à faire :

### Intégration IA

Tout le chantier est suivi dans [docs/ia.md](docs/ia.md) (décisions, architecture, jalons, état).

- [x] J0 — preuve MCP Java ↔ client, décisions de cadrage du 2026-10-24.
- [ ] J1 — tranche verticale « questions et vues pilotées » (lecture seule, données de dev).
- [ ] J2 — périmètres de données par fiche de poste, avant tout utilisateur non administrateur.
- [ ] J3 à J8 — pilote réel, contrôle de la paie, documents RH, assistant réglementaire, terrain, autres départements.

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
3. **Fait localement** : source réelle `GET /chantiers/carte`, qualification manuelle (nature, localisation, coordonnées, affichage) et migrations de schéma/reprise auditée. Voir [README Chantier](docs/chantier/README.md).
4. **Fait localement** : marqueurs MapLibre accessibles, fiche des sites partagés, signalement du chargement/vide/erreur. Restent le panneau « À localiser » et la confirmation à l'écran des noms arabes.
5. **Fait localement** : barre compacte bleu nuit avec filtre multi-sélection Nature, compteur court et carte immersive Chantier sans liste latérale ni renvoi vers Google Maps ; le filtre préserve Plan/Satellite/Relief.
5 bis. **Fait (2026-10-18)** : page minimale `/carte` protégée par `CARTE_READ`, entrée de menu « Carte », composant cartographique ; points réels raccordés par la source protégée.
5 ter. **Fait (2026-10-18)** : carte « niveau Google Maps » — le monde entier en globe (Maroc détaillé jusqu'au bâtiment),
   zoom 19, bâtiments 3D, relief Mapterhorn auto-hébergé (ombrage et terrain 3D), calques Plan / Satellite / Relief,
   imagerie Esri relayée par nginx avec la clé ArcGIS côté serveur, vue 3D, boussole, position, plein écran, échelle, fiche
   d'un lieu ([ADR 0009](docs/adr/0009-carte-satellite-relief-3d.md)). **En production** : créer la clé ArcGIS gratuite et la
   mettre dans `.env` (`ARCGIS_API_KEY`, pas à pas dans docs/chantier/carte.md) ; relancer
   `scripts/carte/preparer-fond-carte.sh` (environ 40 Go au zoom 13, prévoir le double pendant la préparation) ; déployer
   la nouvelle image du frontend. **Reste** : recherche de lieux (reportée) ; renouveler la clé ArcGIS avant son échéance.
   À vérifier en production : rendu du fond à l'écran (clair/sombre, téléphone), noms arabes.

## Vues Cartes, Tabulaire et Analytique

- **Convention commune** : les domaines métier qui présentent une collection consultable suivent le pattern défini dans `conventions/frontend.md` (« Pattern des trois vues métier ») et l'ADR 0012. Coque et assemblage Tabulaire configurables sont partagés; routes, filtres, données, colonnes, cellules, actions et règles métier restent propres à chaque domaine.
- **Fait (2026-10-17) — domaine Paie** : les vues Tabulaire, Cartes et Analytique sont livrées sous une coque commune
  (`portail/paie/vues/`, sélecteur de vue, actions dans l'en-tête), avec filtres et navigation cohérents entre les niveaux.
- **Fait (2026-10-19) — domaine Employés** : plan validé en 5 lots. Lot 1 fait : sélecteur de vue extrait dans
  `shared/components/vue-switcher/` (Paie l'utilise), coque `portail/employee/vues/` (titre, actions, barre de filtres dans
  l'URL) et vue Tabulaire. Lot 2 fait : fiche = état du dernier mois de paie (équipe, salaire et type, réservés à
  `PAIE_READ`), table `employe_sortie`, reprise V30 (ADR 0010). **À vérifier avant le déploiement** : sauvegarde de la base
  de production (V30 supprime les employés sans aucun bulletin). Lot 3 fait : assistant d'import de la paie (analyse,
  corrections des fiches, départs confirmés, mois suivant uniquement, salaire à 0 refusé) ; à essayer sur le vrai fichier
  d'octobre 2026. Lot 4 fait : fiche de l'employé (situation, ancienneté, âge) et parcours calculé depuis la paie
  (`GET /paie/employes/{id}/parcours`). Lot 5 fait : vues Cartes (descente libre chantier / équipe / fonction / employés,
  liste à tout moment) et Analytique (chiffres, tranches, répartition, mouvements de la paie) — voir docs/employee/README.md.
  Libellés RH (2026-10-19) : employé « En poste » / « Sorti », chantier « En cours » / « Clôturé » (boutons Clôturer / Rouvrir) ;
  V31 supprime les fonctions et clôture les chantiers sans bulletin ; l'assistant d'import propose de rouvrir un chantier clôturé.
- **Revue propriétaire dans l'ordre Équipe → Fonction → Chantier → Employé → Paie** : les dossiers de chaque domaine décrivent le fonctionnement et les scénarios de contrôle. Équipe est documenté dans [son README](docs/equipe/README.md); les choix confirmés et les preuves à jour y sont consignés avec les tests concernés.
  **Vues partagées (2026-10-23, décision du propriétaire)** : Cartes et Analytique partagées (`portail/perimetre/`, ADR 0011) et coque/Tabulaire configurables partagés (`shared/components/`, ADR 0012) pour les cinq modules — Paie, Employés,
  Équipes, Fonctions, Chantiers — inscrits dans `conventions/frontend.md`. Les
  anciennes Cartes / Analytique propres à chaque module sont supprimées, ainsi que le fil de navigation de la barre de filtres Paie ; la
  suppression en groupe de la paie reste, sur chaque carte.
  Voir [docs/frontend/vues-perimetre.md](docs/frontend/vues-perimetre.md).
  **Chantiers (implémenté, 2026-10-23)** : mêmes trois vues que Équipes et Fonctions (Tabulaire, Cartes, Analytique) sous une coque commune
  (`ChantierVuesComponent`), synchronisation et création dans l'en-tête; filtres code, désignation et statut dans l'URL, appliqués de la même
  façon aux trois vues; Cartes et Analytique relient le chantier aux effectifs Employé (dernier état importé) et aux indicateurs/historiques
  Paie (STC compris), sans nouvel endpoint, sous `EMPLOYEE_READ` et `PAIE_READ` vérifiés séparément. La carte géographique reste séparée.
  Décision du propriétaire (2026-10-23) : la modification du code d'un chantier (code changé partout, historique compris) est conservée.
  Tests unitaires frontend et E2E mockés verts localement. Voir le
  [PV de stabilisation ERP-RH](docs/handoff/pv-n1-erp-rh.md) (section 10) et le [README Chantier](docs/chantier/README.md).
  **Fonctions (implémenté, 2026-10-23)** : mêmes trois vues que Équipes (Tabulaire, Cartes, Analytique) sous une coque commune
  (`FunctionVuesComponent`), import Excel et création déplacés dans l'en-tête; filtre libellé dans l'URL, appliqué de la même façon aux trois vues; la répartition par fonction de `POST /paie/analytique` porte désormais les STC (`stc`, `stcMontant`); Cartes et Analytique relient la fonction
  aux effectifs Employé (dernier état importé) et aux indicateurs/historiques Paie, sans nouvel endpoint, sous `EMPLOYEE_READ` et `PAIE_READ`
  vérifiés séparément. Tests frontend et E2E mockés verts localement.
  Décisions du propriétaire (2026-10-23) : le renommage actuel (libellé modifié partout, historique compris) et le refus de supprimer une
  fonction utilisée sont conservés. Les quasi-doublons de libellés (9 paires) restent suivis dans « Qualité des données », hors de ce lot. Voir le [PV de stabilisation ERP-RH](docs/handoff/pv-n1-erp-rh.md) et le [README Fonction](docs/function/README.md).
  Le PV couvre toute l'application et sera complété domaine par domaine. Avant toute transmission aux intervenants, le propriétaire doit valider le document complet; les règles doivent avoir une preuve traçable et toute exception reste visible et soumise à approbation.
  Les anciens composants vides (« disponible prochainement »), sans route ni onglet, ont été retirés pendant la revue de
  conformité ; aucun parcours utilisateur n'y était relié.

Les cinq domaines de collection utilisent les vues, la coque et le Tabulaire partagés. La revue technique des
domaines Employé, Paie, Rapport, Auth, Paramètres et Audit complète celle des trois référentiels. Les dossiers de domaine
centralisent leurs règles, contrats et scénarios; les accords métier du [PV global](docs/handoff/pv-n1-erp-rh.md)
restent à recueillir avant diffusion. Le premier import réel et les décisions de qualité des données restent suivis ci-dessous.

- [ ] **Équipe — support de formation** : préparer ultérieurement une présentation et une vidéo de démonstration du domaine. Ce travail n'est pas planifié pour le moment.

---

## Prochaine tâche — Qualité des données (une seule tâche, tous les domaines)

**Cible qualité de données (2026-10-03)** : les champs définis comme obligatoires doivent l'être à
tous les niveaux et **aucun doublon ne peut exister**, sous réserve des décisions métier récentes
documentées dans les dossiers de domaine. À vérifier domaine par domaine (Employé, Chantier, Fonction,
Équipe, Paie, Utilisateur, Rôle), à quatre niveaux — base (`NOT NULL`, contraintes `UNIQUE`), API (validation des
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

- **Autres champs aujourd'hui facultatifs** à trancher un par un : pour Paie `observation`, jours de récupération, primes ; pour Chantier `nom` et `designation` ;
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
- **Confirmer avec la RH la signification et le libellé des équipes `A`, `LABO`, `ASPHALET` et `8`** : créées
  avec un libellé identique au code; après décision, mettre à jour le référentiel depuis l'écran Équipes.
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

Le propriétaire n'utilisera pas SSH. Le déploiement manuel a été confirmé le 2026-10-16 : aucun staging
ni déploiement automatisé vers le serveur. La production utilisera `latest` pour les quatre images
après réussite des contrôles automatisés du projet (voir [ADR 0004](docs/adr/0004-production-latest-tag.md)).
`docker compose pull && docker compose up -d` inclut tous les services, sauvegarde et IA comprises, sans profil. La revue de l'extrait Nginx outer a été faite ; les contrôles restants sont
détaillés ci-dessus.

## Performance — arbitrages et mesures à terminer

Le contrôle automatisé du dépôt est conforme à 100 % : le profil PostgreSQL synthétique passe les
contrôles du projet. Cela ne valide pas les capacités de l'hôte de production.
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
