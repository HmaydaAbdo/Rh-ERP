# rh-erp

> rh-erp est le système de gestion du personelle poitange est paie de  **Staport**,
> une entreprise du BTP (bâtiment et travaux publics).
>
> Ce document est la porte d'entrée du projet.
>
> Les conventions détaillées sont définies dans `conventions`.
> Elles constituent la source de vérité et doivent être respectées lors de toute modification.

---

# Principes

Avant toute modification :

- comprendre le besoin ;
- identifier le ou les modules concernés ;
- respecter les conventions existantes ;
- privilégier la cohérence de l'architecture.

Après toute modification :

- vérifier que le projet compile ;
- supprimer le dead code ;
- mettre à jour la documentation concernée (le README du domaine, `docs/rbac/` si une permission change,
  `docs/data-model.md` si le schéma change, `TODO.md` si un sujet est traité ou découvert).

Une tâche n'est terminée que lorsque le code, la documentation et les conventions sont synchronisés.

Deux règles imposées par le propriétaire, sans exception :

- **Frameworks d'abord.** Tout est bâti sur les frameworks et bibliothèques retenus (Spring, Angular, LangChain,
  LangGraph, CopilotKit, AG-UI, A2UI, LiteLLM…) et sur leurs composants et points d'extension officiels. Ne jamais
  réécrire ce qu'un framework fournit déjà, même partiellement, ni copier le comportement d'un de ses composants.
  Seuls restent écrits par nous les règles métier d'ERP-RH, la configuration et le raccordement entre briques, chacun
  branché sur un point d'extension officiel. Si un besoin semble exiger du code maison, présenter d'abord au
  propriétaire l'option framework, ou l'absence d'option, avant d'écrire quoi que ce soit.
- **Un seul `docker compose pull` puis `docker compose up -d` suffit à tout lancer.** Toute nouvelle brique (service,
  image, réseau, migration, clé générée) est intégrée à `docker-compose.yml` et aux images publiées par la CI ; aucune
  étape manuelle, aucun script à lancer à part, aucun profil à activer pour le fonctionnement normal. Les variables
  obligatoires sont documentées dans `.env.example`.

- **Tout nouveau domaine est intégré à l'IA ERP-RH.** Dès sa conception, documenter ses cas d'usage IA et ses
  données autorisées dans `docs/ia.md`, puis exposer par MCP les capacités métier pertinentes à travers les façades
  publiques du domaine. Les outils respectent le RBAC, le périmètre, l'audit et les conventions MCP ; ils ne donnent
  pas d'accès direct aux repositories ni de CRUD générique. L'intégration et ses contrôles sont livrés avec le domaine.

- **Veille mensuelle des modèles IA.** Pour toute tâche IA ERP-RH, Claude et Codex consultent la routine de
  `docs/ia.md` § 4.1 ; si la revue mensuelle est échue, ils la réalisent et consignent les candidats, les sources et la
  recommandation. Aucun modèle ni configuration ne change sans confirmation humaine du propriétaire.

La [routine de travail et de livraison](conventions/workflow.md) s'applique à chaque tâche : reprise du
contexte et de l'état Git, exécution du périmètre approuvé, vérifications, documentation, puis livraison
et revue. L'appliquer sans attendre que le propriétaire répète ces consignes. Les décisions et
autorisations déjà données restent valables dans leur périmètre ; une modification de convention
nouvellement proposée demande son accord avant application.

`CLAUDE.md` renvoie à cette même porte d'entrée : Claude et Codex appliquent les mêmes règles.
La CI n'est lancée ou relancée que sur demande explicite du propriétaire. Si un push la déclenche
automatiquement, conserver le lot prêt en local jusqu'à cette demande.

La branche distante `main` est protégée : aucune mise à jour directe ou forcée de `main` n'est permise.
Tout changement destiné à `main` passe par une pull request ciblant `main`. Mettre à jour la branche
head de la PR existante lorsqu'il y en a une; sinon, créer une branche de travail et une PR. Ne pas
contourner les contrôles de protection. La livraison et la fusion suivent
[`conventions/workflow.md`](conventions/workflow.md).

---

# Ordre de lecture

Pour reprendre le travail en cours (état du projet, règles du propriétaire, déploiement, sujets ouverts), lire
d'abord `docs/handoff/etat-du-projet.md`.

Lire ensuite `conventions/workflow.md` pour la routine commune, puis les conventions applicables
dans l'ordre ci-dessous.

0. Les conventions de référence résident dans `conventions/` à la racine. Elles constituent le
   blueprint ERP-RH ; lire les documents applicables dans l'ordre ci-dessous.
1. `conventions/architecture.md`
2. conventions/design-patterns.md
3. conventions/configuration.md
4. conventions/jpa.md
5. conventions/database.md
6. conventions/testing.md
7. conventions/deployment.md
8. conventions/backup.md
9. conventions/security.md
10. conventions/audit.md
11. `conventions/agents-ia.md`
12. `conventions/agent-ui.md`
13. `conventions/mcp.md`
14. `conventions/rag.md`
15. conventions/logging.md
16. conventions/swagger.md
17. conventions/metrics.md
18. conventions/performance.md
19. conventions/frontend.md
20. conventions/design-system.md
21. `conventions/integrations.md` (choix des protocoles et intégrations selon le besoin)

Ensuite, la documentation propre au projet (ce que le projet fait, par opposition aux conventions qui disent
comment écrire le code) : `docs/README.md` est l'index — architecture, modèle de données, domaines, imports,
authentification, permissions (RBAC), frontend, tests, configuration, déploiement. Avant de modifier un domaine,
lire son README dans `docs/<domaine>/`, son skill dans `docs/<domaine>/skills/SKILL.md` s'il existe, et son fichier
`docs/rbac/<domaine>.md` s'il existe. Une skill aide l'agent à appliquer le contexte documenté ; elle ne remplace
pas ces sources et ne confère aucun droit applicatif.

En cas de conflit entre plusieurs conventions :

- les conventions à la racine constituent la source normative et le blueprint de référence ;
- la documentation du projet précise le métier et les choix d'implémentation sans affaiblir les
  exigences des conventions ;
- `architecture.md` ERP-RH fait foi pour les choix d'architecture propres au projet ; toute
  contradiction entre les deux niveaux est résolue par un ADR et une mise à jour des documents avant
  le changement concerné.


# Décisions d'architecture

Les conventions définissent les principes généraux du projet, mais elles ne remplacent pas le jugement d'architecture.

Lorsqu'une évolution nécessite un choix d'architecture important (nouveau Design Pattern, refactoring majeur, changement de structure, introduction d'une nouvelle abstraction ou modification d'un composant transversal), ne jamais prendre cette décision seul.

Dans ce cas :

- expliquer brièvement le problème identifié ;
- proposer les différentes approches possibles ;
- recommander celle qui respecte le mieux les conventions du projet ;
- attendre la validation avant de modifier l'architecture.

Ne jamais introduire un Design Pattern, une abstraction ou une refonte importante sans nécessité clairement identifiée.

---
# En cas de doute

Ne jamais faire d'hypothèse sur :

- une règle métier ;
- une décision d'architecture ;
- une convention ;
- une valeur métier ;
- le comportement attendu.

Si une information est manquante ou ambiguë :

- poser une question avant de modifier le code ;
- ne jamais inventer un comportement ;
- ne jamais ajouter une fonctionnalité ou une abstraction non demandée.

Si plusieurs approches sont possibles :

- expliquer brièvement les différentes options ;
- proposer celle qui respecte le mieux les conventions du projet ;
- attendre validation avant de réaliser une modification importante.

Privilégier une question plutôt qu'une mauvaise hypothèse.

---

# Règles générales

Ne jamais :

- contourner une convention existante ;
- introduire de la dette technique ;
- dupliquer une logique métier ;
- laisser du dead code ;
- laisser une fonctionnalité ou une règle métier non documentée.

Toujours privilégier :

- un code simple ;
- une architecture cohérente ;
- une documentation complète ;
- la maintenabilité à long terme.

En cas de doute, les documents présents dans `conventions/` sont la source de vérité du projet.


