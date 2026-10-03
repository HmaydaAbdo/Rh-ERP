# Documentation de rh-erp

> Point d'entrée de la documentation **propre à ce projet** (Staport — gestion du personnel et de la
> paie). Les règles générales de développement, réutilisables d'un projet à l'autre, vivent dans
> [`conventions/`](../conventions) et font foi : `docs/` décrit ce que ce projet *fait*,
> `conventions/` la façon dont on écrit le code.

---

## Par où commencer

| Je veux… | Document |
|---|---|
| Comprendre l'ensemble (modules, dépendances, flux d'une requête) | [architecture.md](architecture.md) |
| Connaître les tables, contraintes et migrations | [data-model.md](data-model.md) |
| Lancer le projet et connaître toutes les variables d'environnement | [configuration.md](configuration.md) |
| Savoir comment les imports Excel se comportent (règles communes) | [imports.md](imports.md) |
| Comprendre l'authentification, les comptes et les rôles | [auth/README.md](auth/README.md) |
| Savoir qui a le droit de faire quoi (catalogue des permissions) | [rbac/README.md](rbac/README.md) |
| Travailler sur l'interface (routes, guards, composants partagés, tableaux) | [frontend/README.md](frontend/README.md) |
| Lancer ou écrire des tests | [testing.md](testing.md) |
| Déployer (Docker, nginx, CI, backup) | [deployment.md](deployment.md) |

---

## Documentation par domaine métier

Chaque domaine suit le même plan : vue d'ensemble, modèle de données, règles métier, API, import
(si applicable), frontend, limites connues.

| Domaine | Rôle | Documentation | Permissions |
|---|---|---|---|
| **Fonction** | Référentiel des fonctions occupées | [function/README.md](function/README.md) | [rbac/function.md](rbac/function.md) |
| **Chantier** | Référentiel des chantiers, ajout automatique depuis l'ERP | [chantier/README.md](chantier/README.md) | [rbac/chantier.md](rbac/chantier.md) |
| **Équipe** | Référentiel des équipes de travail | [equipe/README.md](equipe/README.md) | [rbac/equipe.md](rbac/equipe.md) |
| **Employé** | Fiche d'identité, affectation fonction/chantier | [employee/README.md](employee/README.md) | [rbac/employee.md](rbac/employee.md) |
| **Paie** | Bulletins mensuels (saisie, import, export) | [paie/README.md](paie/README.md) | [rbac/paie.md](rbac/paie.md) |
| **Rapport** | Export Excel et rapport PDF BI de la paie | [report/README.md](report/README.md) | (`PAIE_EXPORT`, voir [rbac/paie.md](rbac/paie.md)) |
| **Auth** | Comptes, rôles, permissions, sessions | [auth/README.md](auth/README.md) | [rbac/auth.md](rbac/auth.md) |

Journal des décisions du rapport PDF (ce qui a été retiré et pourquoi) :
[report/rapport-v2.md](report/rapport-v2.md).

---

## Règles transverses (décisions de fonctionnement)

Ces règles ont été tranchées avec la direction ; elles s'appliquent à tout le projet et sont détaillées
dans le document indiqué.

| Règle | Détail |
|---|---|
| Les fichiers Excel **ajoutent** des données, ils ne **modifient** jamais | [imports.md](imports.md) |
| Toute modification d'une donnée existante se fait depuis l'interface | [imports.md](imports.md), chaque README de domaine |
| La synchronisation des chantiers **ajoute** les chantiers manquants, rien d'autre | [chantier/README.md](chantier/README.md) |
| La paie **n'est pas calculée** : le total est saisi ou importé tel quel | [paie/README.md](paie/README.md) |
| Aucun doublon dans les référentiels (comparaison insensible à la casse) | [data-model.md](data-model.md) |
| Une permission par action ; jamais un rôle codé en dur | [rbac/README.md](rbac/README.md) |
| Chaque écran et chaque bouton d'action est conditionné par une permission | [frontend/README.md](frontend/README.md) |
| Les tableaux sont triables, redimensionnables, réordonnables, configurables, avec filtres en temps réel | [frontend/README.md](frontend/README.md) |

---

## Ce qui reste à faire

Le suivi des sujets ouverts est dans [../TODO.md](../TODO.md) : la tâche « Qualité des données » (tous
champs obligatoires, aucun doublon, nettoyage des données existantes), puis, à part, l'audit
(Hibernate Envers), le domaine Pointage, et le déploiement (backup, CD).

---

## Glossaire

| Terme | Signification |
|---|---|
| **Staport** | L'entreprise de BTP (bâtiment et travaux publics) qui utilise l'application |
| **CIN** | Carte d'identité nationale — clé métier d'un employé |
| **Chantier** | Site de travaux, identifié par un code (ex. `C168`) |
| **Équipe** | Groupe de travail (chauffeurs, opérateurs, atelier…), identifié par un code (ex. `CH`) |
| **Bulletin / paie** | Ligne de paie mensuelle d'un employé (un par employé et par mois) |
| **Période** | Mois de paie, au format `aaaa-MM` dans l'API et `aaaaMM` en base |
| **Snapshot** | Valeur figée au mois du bulletin (fonction, chantier, équipe), qui ne suit pas les changements ultérieurs de l'employé |
| **STC** | Solde de tout compte — employés sortis, suivis à part dans le rapport |
| **J.R.O / J.R.D** | Jours de récupération (jour ouvrable / dimanche) |
| **Prime RO / RD** | Prime de roulage (ordinaire / dimanche) |
| **ERP** | Système de gestion existant de Staport, source des chantiers |
| **Façade de service** | Interface `IXxxService` qu'un domaine expose aux autres : un domaine n'utilise jamais le repository d'un autre |
| **Permission** | Code d'action (ex. `PAIE_WRITE`), attribué via des rôles ; un refus individuel l'emporte sur les rôles |
