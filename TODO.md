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

## Paie — trois vues (en cours, décision du 2026-10-04)

Tabulaire (existante) et **Cartes** (livrée, voir `docs/paie/README.md`, « Vue Cartes »). Reste :

- **Vue Analytique** : tableau de bord interactif, avec sélection de la période et filtres (chantiers, fonctions…),
  KPI et variation vs mois précédent, masse par chantier, répartition des totaux par tranche, évolution (si au moins
  3 mois), qualité des données. Prévu : Chart.js via `p-chart` (nouvelle dépendance validée), un endpoint
  `GET /paie/analytique` (`PAIE_READ`), une barre de sélection partagée avec la vue Cartes, et un lien
  « Analyser ce chantier » depuis une carte. À construire une fois la vue Cartes validée.
- **Niveau 3 des Cartes → vue tabulaire** : cliquer une équipe ouvrirait la liste déjà filtrée (période, chantier,
  équipe). Demande que la liste lise des paramètres d'URL, et que l'API expose l'id du chantier (seul son code l'est).

---

## Anomalies constatées à trancher (relevées lors de la mise à jour de la documentation, 2026-10-03)

Comportements actuels, documentés tels quels (voir `docs/data-model.md`, `docs/auth/README.md`) mais qui
demandent une décision avant correction :

- **Suppression d'un employé qui a des bulletins ou un compte utilisateur** : la base refuse (clés
  étrangères) et l'API répond par une erreur `500` générique. À décider : bloquer avec un `409` explicite (comme
  pour fonction, chantier et équipe), ou autre règle. Le passage à `INACTIF` conserve l'historique.
- **Compte désactivé** : `AuthService.refresh` ne vérifie pas `actif` et la désactivation ne révoque pas les
  jetons de rafraîchissement : un compte désactivé garde son accès jusqu'à 30 jours. À corriger (refuser le
  rafraîchissement d'un compte inactif et/ou révoquer ses jetons à la désactivation).
- **Réinitialisation du mot de passe par un administrateur** (`POST /users/{id}/reset-password`) : ne révoque pas
  les sessions ouvertes, contrairement à la réinitialisation par courriel.
- **Pas de limitation des tentatives** de connexion ni de demandes de réinitialisation (force brute).
- **Aucune règle de complexité** de mot de passe (8 à 100 caractères seulement).
- **Suppression d'un rôle** : possible même s'il est porté par des utilisateurs (ils le perdent), y compris
  `SYSTEM_ADMIN` — risque de se retrouver sans administrateur. À décider (rôles protégés, blocage si utilisé).
- **Métriques** : les compteurs de synchronisation sont enregistrés dans Micrometer mais aucun export
  (Prometheus) n'est configuré, alors que `/actuator/prometheus` est autorisé par la configuration de sécurité.
- **Tests frontend** : seuls les guards et la coque de l'application sont testés ; aucun test sur les écrans.

---

## À part — gros chantiers et déploiement (à reprendre plus tard)

### Audit (Hibernate Envers)
Rien n'existe encore (ni dépendance Envers, ni `GenericAuditAspect`, ni table `Log`) alors que
`conventions/audit.md` le décrit. À faire : mettre en place l'infrastructure, annoter au minimum
`Employee` et `Paie` avec `@Audited`, décider pour les référentiels (`Function`, `Chantier`, `Equipe`).

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
