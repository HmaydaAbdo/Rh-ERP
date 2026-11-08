# ERP-RH — entrée pour Claude

Avant toute intervention, lire et appliquer [AGENTS.md](AGENTS.md), la porte d'entrée commune à
Claude et Codex. Ce fichier centralise les principes, l'ordre de lecture et les règles d'accord du
propriétaire. Les conventions détaillées font autorité dans `conventions/`.

Pour reprendre et mener une tâche :

1. Consulter Jira (projet `KAN`) pour l'état, les tâches et leurs preuves ; lire
   [`site/docs/exploitation/developpement-local.md`](site/docs/exploitation/developpement-local.md) et [`conventions/lecons.md`](conventions/lecons.md).
2. Suivre la [routine commune](conventions/workflow.md), puis les conventions applicables dans
   l'ordre indiqué par `AGENTS.md`.
3. Ouvrir [l'index de documentation](docs/README.md), puis le README, la skill et les permissions
   des domaines concernés.
4. Lors d'un passage entre Claude et Codex, vérifier l'état réel des fichiers, de la branche et des
   contrôles. Avant de céder le travail, mettre à jour la tâche Jira (statut, preuve, prochaine action en commentaire) :
   il n'y a pas de handoff markdown.

La CI est lancée ou relancée uniquement sur demande explicite du propriétaire. Un push qui la
déclencherait automatiquement attend également cette demande ; garder le travail prêt en local.

Appliquer la **boucle Ralph** d'[AGENTS.md](AGENTS.md), détaillée dans
[`conventions/workflow.md`](conventions/workflow.md) : poursuivre les étapes autorisées jusqu'à
la fin prouvée de la demande ; un résultat partiel ne justifie pas de rendre la main.
La branche distante `main` est protégée : ne jamais y pousser directement ni forcer sa mise à jour.
Publier les changements destinés à `main` sur la branche head de la PR existante, ou ouvrir une PR
ciblant `main` si aucune n'existe. Respecter les contrôles requis et la routine définie dans
[`conventions/workflow.md`](conventions/workflow.md).

Principes d'ingénierie (décision du 2026-11-03), à appliquer dès l'ouverture d'une tâche : abstraction à sa place (c'est à
Claude de proposer l'abstraction officielle de chaque cas d'usage, registre dans
[`conventions/ingenierie-agentique.md`](conventions/ingenierie-agentique.md)), bon framework, bon outillage, transfert
technologique voulu (A2UI pour l'interface agentique, à pleine capacité, au-dessus d'AG-UI), objectif permanent de 0 % de code
fait maison suivi dans l'épopée E10 (KAN-23), application agentique au niveau de la page (l'agent ne navigue pas), et site de
documentation à jour à la fin de chaque épopée.

**Règle stricte, à appliquer avant tout choix de dépendance** : technologie native et meilleur choix argumenté, toujours la 
dernière version stable de chaque couche (le paquet et ce qui l'enveloppe, par exemple FastMCP 4 et non le SDK MCP seul), et 
veille continue de tous les choix adoptés (règle « Technologie native, meilleur choix, dernière version, veille continue » 
d'`AGENTS.md`, erreur déjà commise dans `conventions/lecons.md`).

Les règles communes sont maintenues dans `AGENTS.md` et les conventions. Une nouvelle consigne
durable s'y consigne une seule fois pour rester applicable aux deux assistants.

Les tâches se suivent dans Jira (projet `KAN`, cloudId `04f02d9f-c364-4998-ba63-8ea66be8ec2d`, épopées E0 à E19) :
créer toute nouvelle tâche, tenir le statut et la preuve à jour (règle d'`AGENTS.md`). **Jira et le code sont les seules
sources de suivi : ne créer aucun fichier markdown d'avancement.** Pour tout travail IA : avancer épopée par épopée,
principes et décisions dans [`site/docs/ia/principes-et-decisions.md`](site/docs/ia/principes-et-decisions.md). Ne jamais supposer le comportement d'un
framework : lire sa documentation officielle en entier avant de l'affirmer (règle d'`AGENTS.md`), en passant d'abord par
Context7 (`resolve-library-id` puis `query-docs`). Ne rien supprimer
(fichier, branche, donnée) hors du périmètre de la tâche sans l'accord du propriétaire. Toute nouvelle erreur ou surprise
coûteuse s'ajoute à [`conventions/lecons.md`](conventions/lecons.md).

Tout nouveau domaine doit aussi être intégré à l'IA ERP-RH selon la règle d'`AGENTS.md` : cas d'usage et données
documentés dans `site/docs/ia`, capacités métier pertinentes exposées par MCP et protégées par les permissions du domaine.
