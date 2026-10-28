# ERP-RH — entrée pour Claude

Avant toute intervention, lire et appliquer [AGENTS.md](AGENTS.md), la porte d'entrée commune à
Claude et Codex. Ce fichier centralise les principes, l'ordre de lecture et les règles d'accord du
propriétaire. Les conventions détaillées font autorité dans `conventions/`.

Pour reprendre et mener une tâche :

1. Lire le [handoff du projet](docs/handoff/etat-du-projet.md) pour l'état et les sujets ouverts.
2. Suivre la [routine commune](conventions/workflow.md), puis les conventions applicables dans
   l'ordre indiqué par `AGENTS.md`.
3. Ouvrir [l'index de documentation](docs/README.md), puis le README, la skill et les permissions
   des domaines concernés.
4. Lors d'un passage entre Claude et Codex, vérifier l'état réel des fichiers, de la branche et des
   contrôles ; reprendre les décisions approuvées et la prochaine action du handoff. Avant de céder
   le travail, actualiser ces informations dans le handoff technique approprié.

La CI est lancée ou relancée uniquement sur demande explicite du propriétaire. Un push qui la
déclencherait automatiquement attend également cette demande ; garder le travail prêt en local.
La branche distante `main` est protégée : ne jamais y pousser directement ni forcer sa mise à jour.
Publier les changements destinés à `main` sur la branche head de la PR existante, ou ouvrir une PR
ciblant `main` si aucune n'existe. Respecter les contrôles requis et la routine définie dans
[`conventions/workflow.md`](conventions/workflow.md).

Les règles communes sont maintenues dans `AGENTS.md` et les conventions. Une nouvelle consigne
durable s'y consigne une seule fois pour rester applicable aux deux assistants.

Tout nouveau domaine doit aussi être intégré à l'IA ERP-RH selon la règle d'`AGENTS.md` : cas d'usage et données
documentés dans `docs/ia.md`, capacités métier pertinentes exposées par MCP et protégées par les permissions du domaine.
