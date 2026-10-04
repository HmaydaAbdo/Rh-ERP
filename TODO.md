# TODO — points ouverts

> Suivi des sujets encore à traiter. Les sujets livrés et vérifiés dans le code (imports atomiques,
> PostgreSQL + Flyway, JWT/RBAC et sécurité, déploiement Docker + CI, synchronisation chantiers, rapport
> PDF en HTML, domaine Équipe, tableaux, etc.) ont été retirés de ce fichier : leur description détaillée
> vit dans `docs/` et leur historique dans git.

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
- **Tests frontend** : les écrans Paie (liste, cartes, analytique, filtres, export) et Audit sont testés ; restent sans test les écrans
  Employé, Fonction, Chantier, Équipe, Utilisateurs, Rôles et l'authentification (connexion, mot de passe oublié).

---

## Audit de sécurité — points à traiter (revue du 2026-10-04)

Revue faite après l'ajout des trois vues Paie, de la barre de contexte et de la suppression en groupe. Les points traités sont retirés de ce tableau (leur trace : `docs/` et git) ; **restent le n° 6 (limite de débit) et le n° 7 (Angular 17, reporté)**.
Vérifié et conforme : toutes les routes Paie portent une permission (`EndpointSecurityTest` la verrouille, nouvelles routes
comprises) ; les filtres d'agrégation passent par des paramètres liés (pas d'injection) ; la suppression en groupe exige un mois,
revérifie le nombre confirmé (`409` sinon) et ne supprime que les bulletins qu'elle a chargés ; aucun HTML construit côté
interface. Non revu : configuration des cookies de rafraîchissement et du JWT.

| # | Gravité | Constat | Correction proposée |
|---|---|---|---|
| 6 | Moyenne | **Aucune limite de débit** sur la connexion, la réinitialisation, l'export ni la suppression en groupe (voir « Anomalies ») | Limitation de débit sur `/auth/*` et sur les routes coûteuses |
| 7 | Faible | **9 avis de dépendances, tous sur Angular 17** (XSS i18n, hydratation, attributs SVG), antérieurs aux vues Paie ; l'application n'utilise ni l'i18n ni le rendu serveur. `chart.js` n'apparaît dans aucun avis | Planifier une montée de version d'Angular et de PrimeNG |

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
