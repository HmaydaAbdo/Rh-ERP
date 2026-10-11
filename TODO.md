# TODO — points ouverts

> Suivi des sujets encore à traiter. Les sujets livrés et vérifiés dans le code (imports atomiques,
> PostgreSQL + Flyway, JWT/RBAC et sécurité, déploiement Docker + CI, synchronisation chantiers, rapport
> PDF en HTML, domaine Équipe, tableaux, etc.) ont été retirés de ce fichier : leur description détaillée
> vit dans `docs/` et leur historique dans git.

---

## Suivi de conformité et d’exploitation ERP-RH

Les conventions racine constituent le blueprint réutilisable ; l'ADR historique et les skills IA métier sont dans
`docs/adr/0001-adoption-socle-staport.md` et `docs/<domaine>/skills/`. Java 21 est aligné dans Maven ;
la migration PostgreSQL 18 est validée en local le 2026-10-10. **Frontend (2026-10-10)** : Angular 22.2.2, kit Staport sur
Angular Aria/CDK + Lucide + Tailwind 4, PrimeNG/PrimeIcons/Zone.js/Karma retirés, tests Vitest (653, couverture complète) et E2E Playwright + axe (39),
audit npm sans aucune vulnérabilité, licences contrôlées et SBOM en CI.
Restent à faire :

- **Conformité totale de l'application** : auditer chaque convention sur backend, frontend, tests,
  sécurité, BI/IA, performances, Docker Compose, proxy, CI et exploitation ; établir une
  matrice de preuves, corriger les écarts autorisés et faire valider les décisions nécessaires.
  Voir aussi le [handoff](docs/handoff/conformite-totale.md).
- ensuite instrumenter le catalogue de KPI existant puis cadrer un premier outil MCP RH en lecture
  seule avant d'étendre l'IA.

Ne pas basculer une dépendance majeure ou un volume de base sans validation de compatibilité, tests
et procédure de retour arrière propres à cette étape.

## Mettre la couverture de tests au niveau obligatoire par domaine

La stratégie obligatoire est définie dans `conventions/testing.md`. La CI actuelle exécute les tests
unitaires/intégration backend et frontend, le build de production et des E2E avec API simulée, mais ne
fait pas encore tourner le frontend, l'API et PostgreSQL ensemble. Les E2E frontend des écrans Employé,
Fonction, Chantier, Équipe, Utilisateurs, Rôles et authentification manquent aussi (voir `docs/testing.md`).

- Ajouter une porte full stack reproductible en CI (navigateur, frontend, API et PostgreSQL réels) avec au
  moins un parcours de référence pour chaque domaine et les flux transverses.
- Ajouter les parcours navigateur manquants, puis garder une correspondance domaine → cas → commande CI à jour.
- Rendre explicites les portes bloquantes par type de changement et publier les rapports de couverture par domaine.

## Refonte visuelle (itérations successives — voir `DESIGN.md` et `conventions/design-system.md`)

Fait : marque, jetons, thèmes clair/sombre, polices, coque, responsive, refonte des écrans, graphiques (palette validée, un axe, tableaux de données, redessin à la bascule de thème) et mouvement (squelettes, transitions, thème en fondu). La revue de la phase 7 est terminée. L’écran de connexion passe en phase 8 avec une composition d’accueil immersive et adaptée aux petits écrans. Points déjà identifiés :

- **Filtres des listes dans l'URL** : seuls ceux de la Paie y sont (lien partageable, retour navigateur) ; Employés, Chantiers,
  Fonctions, Équipes, Utilisateurs, Rôles et Journal gardent les leurs en mémoire du composant.
- **Fermeture de l'onglet avec un formulaire modifié** : la confirmation couvre la navigation dans l'application
  (`unsavedChangesGuard`), pas la fermeture ni le rechargement de l'onglet (`beforeunload`).
- **Poids du bundle/CSS** : bundle initial ~555 kB (sous le budget de 800 kB) ; plus aucun dépassement de budget (assistant d'export découpé en étapes).
- **Contraste élevé** : vérifier et compléter le support des préférences système et de `forced-colors` dans l'application, puis l'ajouter aux contrôles visuels automatisés et manuels.
- **Monogramme « S »** (`assets/brand/monogramme.svg`) : dessin provisoire en attendant une version vectorielle du logo.
- **`ExpressionChangedAfterItHasBeenCheckedError`** (mode développement seulement) dans `PaieListComponent` : `loading` passe à
  `true` pendant le premier `onLazyLoad` du tableau, après la détection de changements. Antérieur à la refonte.

---

## Vues Cartes et Analytique des autres domaines (squelettes créés, 2026-10-06)

Seule la Paie a ses trois vues (Tabulaire, Cartes, Analytique) sous une coque commune (`portail/paie/vues/`, sélecteur de vue,
actions dans l'en-tête). Pour **Employés, Chantiers, Fonctions et Équipes**, seul le tabulaire existe ; les composants des deux
autres vues ont été créés **vides** (un message « disponible prochainement »), sans route ni onglet :

- `employee/cartes`, `employee/analytique` (`EmployeeCartesComponent`, `EmployeeAnalytiqueComponent`)
- `chantier/cartes`, `chantier/analytique`
- `function/cartes`, `function/analytique`
- `equipe/cartes`, `equipe/analytique`

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
  sont probablement distinctes). Ensuite, réintroduire le chapitre « Répartition par fonction » dans le
  rapport PDF (donnée déjà calculée côté Java, voir `docs/report/README.md` — « Points d'extension »).
- **Libellés des équipes `A`, `LABO`, `ASPHALET`, `8`** (créées avec libellé = code le 2026-10-03) : à
  compléter avec la RH via l'écran Équipes.
- **Empêcher les quasi-doublons à la saisie** (ex. fonction « TECHNICIEN DE QUALITE » vs « THECNICIEN DE
  QUALITE ») : seule l'égalité exacte (hors casse) est aujourd'hui bloquée.

---

## Travail côté serveur

À traiter en premier lors de la prochaine intervention sur l'hôte de production. Toutes les opérations
ci-dessous sont regroupées car elles nécessitent l'accès serveur ; suivre la [procédure détaillée](docs/deployment.md#migration-majeure-pg17--pg18-en-production).

1. **Migration PostgreSQL 17→18** : obtenir l'accès SSH, inventorier la production et répéter la
   restauration logique sur le serveur à partir d'une sauvegarde stockée sur ce même serveur, hors du
   volume PostgreSQL. Pendant la fenêtre de maintenance, créer/restaurer le volume PG18, démarrer
   Flyway jusqu'à V21 (V16–V21 sont en attente si la production est actuellement en V15), contrôler
   données, rôles, extensions, permissions et application, puis conserver intact le volume PG17
   comme retour arrière.
2. **Activer et vérifier pgAudit en production** pour la seule base ERP-RH, avec toutes les classes
   d'instructions (`all`, y compris `ROLE`), puis confirmer que les événements apparaissent dans les
   journaux PostgreSQL. Cela fait partie de la bascule PG18.
3. **Nginx outer** : le serveur en possède déjà un. Obtenir l'exemple de configuration de l'utilisateur,
   puis s'aligner dessus ; ne pas remplacer ni modifier sa configuration avant cette revue. Voir
   [les informations à fournir](docs/deployment-informations-a-fournir.md).
4. **CD** : après accès SSH, décider si le déploiement doit être automatisé sur tag `v*` après réussite
   de la CI, puis préparer et valider cette chaîne. Ne pas déployer en production avant la migration
   PG17→PG18.
5. **Sauvegarde hors serveur** : différée par décision du 2026-10-11 ; aucun transfert hors hôte n'est
   prévu pour l'instant. Les dumps quotidiens restent sur le serveur.

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
