# TODO — points ouverts

> Suivi des sujets encore à traiter. Les sujets livrés et vérifiés dans le code (imports atomiques,
> PostgreSQL + Flyway, JWT/RBAC et sécurité, déploiement Docker + CI, synchronisation chantiers, rapport
> PDF en HTML, domaine Équipe, tableaux, etc.) ont été retirés de ce fichier : leur description détaillée
> vit dans `docs/` et leur historique dans git.

---

## Adoption du socle Staport dans ERP-RH

Le socle `v0.1.1` est épinglé dans `conventions/staport/` ; l'ADR et les skills IA métier sont dans
`docs/adr/0001-adoption-socle-staport.md` et `docs/<domaine>/skills/`. Java 21 est aligné dans Maven ;
la migration PostgreSQL 18 est validée en local le 2026-10-10. **Frontend (2026-10-10)** : Angular 22.2.2, kit Staport sur
Angular Aria/CDK + Lucide + Tailwind 4, PrimeNG/PrimeIcons/Zone.js/Karma retirés, tests Vitest (186) et E2E Playwright + axe (31),
audit npm sans vulnérabilité haute, licences contrôlées et SBOM en CI. Voir le handoff détaillé dans [HANDOFF.md](HANDOFF.md).
Restent à faire :

- **Frontend — tests du kit** : `ui/select`, `ui/table`, `ui/dialog`, `ui/menu` et les champs n'ont que les E2E du catalogue ; ajouter des
  tests de composants (états, clavier, valeur du `ControlValueAccessor`) ; ajouter des tests de composants pour les listes et
  formulaires Employé, Chantier, Équipe, Utilisateurs et Rôles (aujourd'hui : E2E de Fonction et Paie seulement) ;
- **Frontend — formulaires** : le standard Staport demande les Signal Forms pour tout nouveau formulaire ; les formulaires existants
  restent en Reactive Forms typés (écart toléré par `conventions/frontend.md`), migration à décider écran par écran ;
- **Backend** : contrôle de conformité par domaine (RBAC par domaine, audit métier, secrets/configuration, logs et métriques, erreurs) ;
  rapport d'écarts à produire avant tout changement ;
- mettre à jour les conventions Staport vers la version suivante et repinner le snapshot central ;
- planifier puis exécuter la migration du serveur de production PG17→PG18 : répétition sur sauvegarde,
  fenêtre de maintenance, restauration logique dans un volume neuf, contrôles et conservation du volume
  PG17 comme retour arrière ; suivre [la procédure](docs/deployment.md#migration-majeure-pg17--pg18-en-production) ;
- ensuite instrumenter le catalogue de KPI existant puis cadrer un premier outil MCP RH en lecture
  seule avant d'étendre l'IA.

Ne pas basculer une dépendance majeure ou un volume de base sans validation de compatibilité, tests
et procédure de retour arrière propres à cette étape.

## Refonte visuelle (en cours, phase par phase — voir `DESIGN.md` et `conventions/design-system.md`)

Fait : marque, jetons, thèmes clair/sombre, polices, coque et connexion, responsive, refonte des écrans, graphiques (palette validée, un axe, tableaux de données, redessin à la bascule de thème) et mouvement (squelettes, transitions, thème en fondu). Revue finale faite (phase 7). Points déjà identifiés :

- **Filtres des listes dans l'URL** : seuls ceux de la Paie y sont (lien partageable, retour navigateur) ; Employés, Chantiers,
  Fonctions, Équipes, Utilisateurs, Rôles et Journal gardent les leurs en mémoire du composant.
- **Fermeture de l'onglet avec un formulaire modifié** : la confirmation couvre la navigation dans l'application
  (`unsavedChangesGuard`), pas la fermeture ni le rechargement de l'onglet (`beforeunload`).
- **Poids du bundle/CSS** : bundle initial ~555 kB (sous le budget de 800 kB) ; plus aucun dépassement de budget (assistant d'export découpé en étapes).
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

## Anomalies constatées à trancher (relevées lors de la mise à jour de la documentation, 2026-10-03)

Comportements actuels, documentés tels quels (voir `docs/data-model.md`, `docs/auth/README.md`) mais qui
demandent une décision avant correction :

- **Pas de limitation des tentatives** de connexion ni de demandes de réinitialisation (force brute).
- **Métriques** : les compteurs de synchronisation sont enregistrés dans Micrometer mais aucun export
  (Prometheus) n'est configuré, alors que `/actuator/prometheus` est autorisé par la configuration de sécurité.
- **Tests frontend** : voir « Frontend — tests du kit » ci-dessus.

---

## Audit de sécurité — points à traiter (revue du 2026-10-04)

Revue faite après l'ajout des trois vues Paie, de la barre de contexte et de la suppression en groupe. Les points traités sont retirés de ce tableau (leur trace : `docs/` et git) ; **reste le n° 6 (limite de débit)**.
Vérifié et conforme : toutes les routes Paie portent une permission (`EndpointSecurityTest` la verrouille, nouvelles routes
comprises) ; les filtres d'agrégation passent par des paramètres liés (pas d'injection) ; la suppression en groupe exige un mois,
revérifie le nombre confirmé (`409` sinon) et ne supprime que les bulletins qu'elle a chargés ; aucun HTML construit côté
interface. Non revu : configuration des cookies de rafraîchissement et du JWT.

| # | Gravité | Constat | Correction proposée |
|---|---|---|---|
| 6 | Moyenne | **Aucune limite de débit** sur la connexion, la réinitialisation, l'export ni la suppression en groupe (voir « Anomalies ») | Limitation de débit sur `/auth/*` et sur les routes coûteuses |
| 7 | Traité | `npm audit` : 19 -> 0 vulnérabilité haute (les 4 restantes sont Karma, pair optionnel inutilisé de `@angular/build`, exclu par `--omit=optional`) ; `audit:deps`, `audit:licences` et SBOM CycloneDX en CI | — |

---

## À part — gros chantiers et déploiement (à reprendre plus tard)

### Audit — options non retenues, à déclencher si le besoin apparaît
L'audit est en place (voir [docs/audit/README.md](docs/audit/README.md)). Décisions RH du 2026-10-04 : tout est conservé sans
purge, `AUDIT_READ` réservée à `SYSTEM_ADMIN`, consultations non journalisées, pas de preuve d'intégrité opposable. Ce qui n'est
**pas** fait, et le déclencheur :

| Option | Déclencheur |
|---|---|
| **Restaurer un groupe supprimé depuis l'audit** (le contenu de chaque bulletin est conservé ; il manque l'outil, avec contrôle des conflits employé × mois et une action auditée) | Première suppression par erreur, ou demande RH |
| **Durée de conservation et purge** par catégorie (opérations, sécurité, accès) | Exigence légale (loi 09-08) ou volumétrie |
| **Journal des consultations** (qui a regardé quels salaires) | Besoin exprimé par la direction |
| **Preuve d'intégrité** (chaînage par empreintes, ancrage externe) | Exigence légale ou contentieux |
| **`pgaudit`** pour tracer les interventions SQL directes d'un administrateur de la base | Besoin de couvrir la limite assumée de l'audit |
| **Verrou optimiste** (`@Version`) sur le bulletin : deux personnes qui modifient le même bulletin peuvent s'écraser (l'audit le rend visible, ne l'empêche pas) | Premier écrasement constaté |

### Domaines restants
- **Pointage** : à construire, en passant par les façades `IEmployeeService` (et probablement
  `IPaieService`), jamais par leurs Repository.
- **Paie calculée depuis le Pointage** (décision du 2026-09-22) : à terme plus d'import ni de saisie de la
  paie, calcul automatique à la validation du Pointage ; `PaieImportService`, le contrôleur d'import et le
  bouton « Importer » seraient alors retirés.
- **Statuts provisoire / validé** pour Pointage et Paie (décision du 2026-09-22) : provisoire (éditable)
  puis validé (figé) ; un mois ne peut être saisi que si le précédent est validé (progression
  séquentielle). Machine à états et validation d'enchaînement à concevoir le moment venu.

### Déploiement
- **Backup PostgreSQL** : préparé mais pas implémenté (`docs/deployment.md`) — fréquence, rétention et
  destination externe à décider.
- **CD** : le déploiement (`docker compose pull && up -d` en SSH) reste manuel. À ajouter en fin de CI
  (ex. `appleboy/ssh-action`, secrets GitHub : clé SSH + hôte) ; à trancher : déploiement automatique à
  chaque push sur `main` ou seulement sur un tag `v*`.
- **Nginx outer** : l'ajout du bloc `location /rh-erp/` (snippet dans `docs/deployment.md`) reste une
  action manuelle sur le serveur, hors de ce dépôt.
