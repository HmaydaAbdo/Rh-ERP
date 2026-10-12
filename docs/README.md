# Documentation de rh-erp

> Point d'entrée de la documentation **propre à ce projet** (Staport — gestion du personnel et de la
> paie). Les règles générales de développement, réutilisables d'un projet à l'autre, vivent dans
> [`conventions/`](../conventions) et font foi : `docs/` décrit ce que ce projet *fait*,
> `conventions/` la façon dont on écrit le code.

---

## Par où commencer

Les conventions de référence sont centralisées dans [`conventions/`](../conventions). Elles
constituent le blueprint éprouvé par ERP-RH pour les applications suivantes. Les documents de
`docs/` décrivent le métier, les données et les décisions propres à ERP-RH.

| Je veux… | Document |
|---|---|
| Comprendre l'ensemble (modules, dépendances, flux d'une requête) | [architecture.md](architecture.md) |
| Connaître les tables, contraintes et migrations | [data-model.md](data-model.md) |
| Lancer le projet et connaître toutes les variables d'environnement | [configuration.md](configuration.md) |
| Savoir comment les imports Excel se comportent (règles communes) | [imports.md](imports.md) |
| Comprendre l'authentification, les comptes et les rôles | [auth/README.md](auth/README.md) |
| Savoir qui a le droit de faire quoi (catalogue des permissions) | [rbac/README.md](rbac/README.md) |
| Travailler sur l'interface (routes, guards, composants partagés, tableaux) | [frontend/README.md](frontend/README.md) |
| Lancer les tests et voir l'état actuel de la suite | [testing.md](testing.md) · [couverture par domaine](testing/domain-coverage.md) · règles obligatoires : [conventions/testing.md](../conventions/testing.md) |
| Déployer (Docker, nginx, CI, backup) | [deployment.md](deployment.md) |
| Informations encore à fournir pour le déploiement | [deployment-informations-a-fournir.md](deployment-informations-a-fournir.md) |
| Comprendre l'audit (journal, historique, événements de sécurité, garde-fous) | [audit/README.md](audit/README.md) |
| Connaître l'état de conformité du backend et de l'exploitation (écarts corrigés et ouverts) | [conformite/README.md](conformite/README.md) · [matrice](conformite/matrice.md) · [journal du contrôle](conformite/controle-2026-10-11.md) · [preuve sécurité](conformite/security-2026-10-12.md) · [applicabilité IA/MCP/RAG](conformite/applicabilite.md) |
| Intégrer des interfaces agentiques (AG-UI, A2UI, mascotte) | [conventions/agent-ui.md](../conventions/agent-ui.md) |
| Reprendre l'audit exhaustif de conformité | [handoff/conformite-totale.md](handoff/conformite-totale.md) |
| Reprendre la refonte visuelle après le handoff | [handoff/refonte-visuelle.md](handoff/refonte-visuelle.md) |
| Comprendre les décisions d'architecture et la trajectoire ERP-RH | [ADR 0001 — conventions ERP-RH](adr/0001-adoption-socle-staport.md) · [ADR 0002 — interfaces agentiques](adr/0002-interface-agentique-ag-ui-a2ui.md) · [ADR 0003 — CORS explicite](adr/0003-cors-origines-explicites.md) |

---

## Documentation par domaine métier

Chaque domaine suit le même plan : vue d'ensemble, modèle de données, règles métier, API, import
(si applicable), frontend, limites connues.

| Domaine | Rôle | Documentation | Permissions |
|---|---|---|---|
| **Fonction** | Référentiel des fonctions occupées | [README](function/README.md) · [skill IA](function/skills/SKILL.md) | [rbac/function.md](rbac/function.md) |
| **Chantier** | Référentiel des chantiers, ajout automatique depuis l'ERP | [README](chantier/README.md) · [skill IA](chantier/skills/SKILL.md) | [rbac/chantier.md](rbac/chantier.md) |
| **Équipe** | Référentiel des équipes de travail | [README](equipe/README.md) · [skill IA](equipe/skills/SKILL.md) | [rbac/equipe.md](rbac/equipe.md) |
| **Employé** | Fiche d'identité, affectation fonction/chantier | [README](employee/README.md) · [skill IA](employee/skills/SKILL.md) | [rbac/employee.md](rbac/employee.md) |
| **Paie** | Bulletins mensuels (saisie, import, export) | [README](paie/README.md) · [skill IA](paie/skills/SKILL.md) | [rbac/paie.md](rbac/paie.md) |
| **Rapport** | Assistant d'export, export Excel et rapport PDF BI de la paie | [README](report/README.md) · [skill IA](report/skills/SKILL.md) | (`PAIE_EXPORT`, voir [rbac/paie.md](rbac/paie.md)) |
| **Auth** | Comptes, rôles, permissions, sessions | [README](auth/README.md) · [skill IA](auth/skills/SKILL.md) | [rbac/auth.md](rbac/auth.md) |
| **Paramètres** | Valeurs de fonctionnement administrables | [README](parametre/README.md) | [rbac/parametre.md](rbac/parametre.md) |
| **Audit** | Journal d'audit, historique des enregistrements, événements de sécurité | [README](audit/README.md) · [skill IA](audit/skills/SKILL.md) | [rbac/audit.md](rbac/audit.md) |

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
| Toute écriture et tout export laissent une trace (qui, quoi, quand, d'où, avant / après) ; l'application ne peut pas réécrire l'audit | [audit/README.md](audit/README.md) |

---

## Ce qui reste à faire

Le suivi des sujets ouverts est dans [../TODO.md](../TODO.md) : la tâche « Qualité des données » (tous
champs obligatoires, aucun doublon, nettoyage des données existantes), l'audit de sécurité (points à traiter), puis, à part,
le domaine Pointage et le déploiement (backup, CD).

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
