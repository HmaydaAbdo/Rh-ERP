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
intégrer ces capacités dans l'application à partir de besoins RH concrets ; aucune architecture ni
fonctionnalité n'est présupposée.

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

## Vues Cartes et Analytique des autres domaines

Seule la Paie a ses trois vues (Tabulaire, Cartes, Analytique) sous une coque commune (`portail/paie/vues/`, sélecteur de vue,
actions dans l'en-tête). Pour **Employés, Chantiers, Fonctions et Équipes**, seule la vue tabulaire existe. Les anciens composants
vides (« disponible prochainement »), sans route ni onglet, ont été retirés pendant la revue de conformité ; aucun parcours
utilisateur n'y était relié.

À faire, domaine par domaine : concevoir et coder le contenu de chaque vue (avec ses tests) ; ajouter une coque commune sur le
modèle de `PaieVuesComponent` (titre, onglets de vue au même niveau que les actions déjà dans l'en-tête, filtres) ; déclarer les routes
`cartes` et `analytique` dans `<domaine>.routes.ts` avec la permission de lecture ; documenter dans `docs/<domaine>/README.md`.

---

## Prochaine tâche — Qualité des données (une seule tâche, tous les domaines)

**Règles voulues (2026-10-03)** : dans **tous** les domaines, **tous les champs sont obligatoires** et
**aucun doublon ne peut exister**. À vérifier domaine par domaine (Employé, Chantier, Fonction, Équipe,
Paie, Utilisateur, Rôle), à quatre niveaux — base (`NOT NULL`, contraintes `UNIQUE`), API (validation des
DTO et contrôle d'unicité dans les services, insensible à la casse et aux espaces), interface (champs
marqués obligatoires) et imports Excel (ligne rejetée si champ manquant ou doublon) — puis sur les
**données existantes** (champs vides, doublons), avec correction par migration Flyway.

À instruire dans cette tâche :

- **Avant V22–V25** : vérifier les doublons selon les normalisations imposées par les index :
  `upper(cin)`, `upper(fonction.libelle)`, `upper(chantier.code)`, puis
  `upper(btrim(equipe.code))` et `upper(btrim(equipe.libelle))`. Les migrations échouent
  volontairement si un tel doublon existe ; aucune donnée n'a été consultée ou modifiée dans le
  cadre du contrôle de conformité.

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
  sont probablement distinctes). La répartition globale par fonction reste retirée jusqu'au nettoyage ; au
  niveau chantier, le rapport affiche désormais cette répartition lorsque aucune équipe n'est sélectionnée
  (voir « Points d'extension » dans
  [`docs/report/README.md`](docs/report/README.md) et le [dossier d’évolution du rapport](evolution-rapport/README.md)).
- **Vérifier le doublon apparent du chantier `C157A`** : il apparaît deux fois dans le filtre Chantiers
  « Tous les mois » avec deux options distinctes. Confirmer s'il s'agit de deux enregistrements en base,
  puis décider avec la RH s'il faut corriger les données ou différencier les libellés.
- **Libellés des équipes `A`, `LABO`, `ASPHALET`, `8`** (créées avec libellé = code le 2026-10-03) : à
  compléter avec la RH via l'écran Équipes.
- **Empêcher les quasi-doublons à la saisie** (ex. fonction « TECHNICIEN DE QUALITE » vs « THECNICIEN DE
  QUALITE ») : seule l'égalité exacte (hors casse) est aujourd'hui bloquée.

---

## Travail côté serveur

À traiter lors d'interventions autorisées sur l'hôte de production. Vérifier les sauvegardes et les
procédures propres à chaque opération dans `docs/deployment.md` avant toute action.

1. **Terminer l'exploitation pgAudit** : la génération des événements en production est confirmée.
   La RH a fixé le 2026-10-15 la conservation des CSV pgAudit à 90 jours, distincte de la conservation
   à vie de `audit_journal`/Envers. Le service Compose `postgres-log-retention` et son exécution quotidienne
   à 03:00 UTC sont implémentés ; les déployer et vérifier la purge effective. Contrôler les droits d'accès
   et la protection du volume CSV, puis configurer des alertes de capacité et sur
   `rh.audit.ecriture.echec`, `rh.audit.integrite.compromise` et `rh.audit.chaine.invalide`.
2. **Contrôles de connexion et de proxy en production** : vérifier sans afficher les secrets que
   `JWT_SECRET` est propre à la production et suffisamment aléatoire, que Swagger est désactivé et que
   le mot de passe administrateur initial a été changé. Tester le verrouillage après 5 échecs pendant
   15 minutes et la rotation/révocation des sessions. Confirmer que Nginx outer transmet l'adresse IP
   réelle, que Nginx inner n'accepte ces en-têtes que depuis l'outer, et que les limites de connexion
   s'appliquent bien par utilisateur/adresse. Après HTTPS, vérifier aussi le cookie `Secure` et les
   origines CORS publiques. Aucun secret ne doit être partagé.
3. **Mettre l'accès ERP en HTTPS** (session dédiée) : déterminer l'URL publique et le point de terminaison
   TLS, configurer le certificat et le listener Nginx, puis vérifier la redirection HTTP→HTTPS, le
   sous-chemin `/erp-rh/`, les cookies sécurisés, CORS et le renouvellement du certificat. La config
   Nginx actuelle ne montre que HTTP/80 ; ne pas modifier le serveur avant de confirmer le nom public
   et la méthode d'obtention/renouvellement du certificat.
4. **Protection opérationnelle des journaux applicatifs** : sur l'hôte, contrôler les propriétaires et ACL de
   `./logs/` (lecture réservée aux opérateurs autorisés), l'espace disque disponible, la rotation UTC et la
   purge effective au-delà de 30 jours ; confirmer que le flux console et les archives ne sont accessibles
   qu'aux administrateurs autorisés et que la rétention est compatible avec les obligations applicables.
5. **Raccorder la supervision métrique en production** (session dédiée) : configurer un collecteur Prometheus privé
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
