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

---

# Ordre de lecture

0. `STAPORT_STANDARDS_VERSION`, `conventions/staport/README.md`, puis les standards de la version
   épinglée dans `conventions/staport/v<version>/` (architecture, PostgreSQL/Flyway/pgvector, RBAC,
   audit, tests, Angular, design system, agents/skills/MCP/RAG/BI).
1. `conventions/architecture.md`
2. conventions/design-patterns.md
3. conventions/configuration.md
4. conventions/jpa.md
5. conventions/database.md
6. conventions/testing.md
7. conventions/deployment.md
8. conventions/security.md
9. conventions/audit.md
10. conventions/logging.md
11. conventions/swagger.md
12. conventions/metrics.md
13. conventions/performance.md
14. conventions/frontend.md
15. conventions/design-system.md

Ensuite, la documentation propre au projet (ce que le projet fait, par opposition aux conventions qui disent
comment écrire le code) : `docs/README.md` est l'index — architecture, modèle de données, domaines, imports,
authentification, permissions (RBAC), frontend, tests, configuration, déploiement. Avant de modifier un domaine,
lire son README dans `docs/<domaine>/`, son skill dans `docs/<domaine>/skills/SKILL.md` s'il existe, et son fichier
`docs/rbac/<domaine>.md` s'il existe. Une skill aide l'agent à appliquer le contexte documenté ; elle ne remplace
pas ces sources et ne confère aucun droit applicatif.

En cas de conflit entre plusieurs conventions :

- le socle Staport épinglé fixe les exigences communes minimales, particulièrement sécurité, audit
  et confidentialité ;
- les conventions ERP-RH précisent l'implémentation et les règles du projet ; elles peuvent
  renforcer le socle, pas en affaiblir les exigences ;
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


