# metaswarm : outil d'orchestration installé, et comment il s'applique ici

[metaswarm](https://github.com/dsifry/metaswarm) (MIT, version 0.16.0 installée le 2026-11-15) est un greffon de Claude Code,
installé **pour tout le compte de l'utilisateur** (`claude plugin install metaswarm@metaswarm-marketplace`, portée
`user`), donc actif dans toutes les sessions. Il apporte 23 agents, 14 skills, 16 commandes et des portes de qualité.
Cette page dit ce que l'outil change au comportement des sessions et **comment l'employer sans contredire les règles du
dépôt**. En cas de conflit, `AGENTS.md`, les conventions et les décisions du propriétaire l'emportent toujours sur l'outil.

## Ce que l'outil change

- **Crochet de session** (`SessionStart` et `PreCompact`) : à chaque ouverture, reprise, `/clear` et compactage, il injecte
  un message de contexte. Dans un dépôt sans `.metaswarm/project-profile.json` (le nôtre), il ne fait que proposer `/setup` :
  **ignorer cette proposition**. Il ne recopie des fichiers (instructions, seuils de couverture) que si ce profil existe :
  ne jamais le créer ici.
- **Skill `start`** : s'active seule sur « start task », « work on issue », « use metaswarm ». Elle ouvre le flux
  recherche → plan → portes de revue → exécution orchestrée → PR.
- **Portes de revue** : porte de revue du plan (3 relecteurs adverses : faisabilité, complétude, périmètre) et porte de revue
  de conception (6 spécialistes en parallèle : produit, architecture, design, sécurité, UX, CTO), avec itérations bornées
  aux seuls constats bloquants (10 tours au plus).
- **Boucle d'exécution** par unité de travail : implémenter → valider → revue adverse → commit. Le coordinateur relance
  lui-même les contrôles (il ne croit jamais le compte rendu d'un sous-agent) et la revue adverse cite des preuves
  `fichier:ligne`.
- **Brainstorming** : tableau des hypothèses, confirmation avant de concevoir, liste des malentendus fréquents.
- **Suivi** : tâches dans BEADS (`bd`), base de connaissances JSONL, notes de conception dans `docs/plans/`.
- **Commandes** : `/start-task`, `/brainstorm`, `/review-design`, `/prime`, `/self-reflect`, `/handoff`, `/pr-shepherd`,
  `/handle-pr-comments`, `/create-issue`, `/status`, `/setup`, `/update`, `/external-tools-health`.
- **Délégation externe facultative** à Codex CLI et Gemini CLI (relecture croisée entre modèles).

## Règles d'emploi dans ce dépôt

1. **Jira reste la seule source de suivi.** Ne pas utiliser BEADS (`bd`), ne créer ni `.beads/`, ni `.metaswarm/`, ni
   `docs/plans/`, ni `docs/superpowers/`, ni aucun fichier markdown d'avancement. Les constats d'une porte de revue vont
   dans un commentaire Jira, les décisions durables dans `site/docs/` et `conventions/`.
2. **Ne jamais lancer `/setup`, `/metaswarm-setup`, `/migrate`, `/update` ni `npx metaswarm`** ici sans l'accord du
   propriétaire : ils réécrivent `CLAUDE.md` et `AGENTS.md`, créent `.coverage-thresholds.json`, des raccourcis de
   commandes et peuvent ajouter un workflow CI. Les instructions du dépôt sont maintenues par nous, une seule fois.
3. **Le propriétaire décide.** Les portes de revue s'emploient sur demande, pour une conception d'épopée ou d'architecture
   (en plus de la présentation des options et de la recommandation exigée par `workflow.md`), jamais pour un correctif.
4. **CI et PR : l'Auto-fix de l'application, pas `/pr-shepherd`.** La CI n'est lancée que sur demande explicite et
   l'Auto-fix (`set_monitor`) surveille la PR : ne pas lancer la boucle de surveillance de l'outil.
5. **Aucune délégation externe sans accord.** Envoyer du code ou des données à Codex CLI ou Gemini CLI sort du dépôt :
   uniquement avec l'accord du propriétaire, gratuit et sans donnée RH ni secret (CNDP).
6. **Le travail reste sur la branche et la PR uniques** de `workflow.md` ; l'outil ne crée ni branche ni worktree de plus.

## Ce que nous en reprenons

Ces pratiques complètent la routine de [`workflow.md`](workflow.md), sans outil à lancer :

- **Valider soi-même** : relancer les contrôles et ne jamais se fier au compte rendu d'un sous-agent ou d'une session
  parallèle (vérifier les fichiers, la branche, les tests).
- **Revue adverse avant la PR** sur tout changement non trivial : chercher activement ce qui casse, avec preuve
  `fichier:ligne`, ou `/code-review` ; pas d'approbation sans preuve.
- **Tableau des hypothèses** avant une conception : lister ce qu'on suppose, le faire confirmer par le propriétaire si
  l'enjeu le justifie.
- **Itérer sur les constats bloquants seulement** ; le reste devient un ticket Jira de suite.
- **Capitaliser** : toute erreur ou surprise coûteuse va dans [`lecons.md`](lecons.md) (notre base de connaissances), pas dans
  un fichier JSONL.
- **Reprise après compactage** : l'état vit dans Jira, le code et la branche, jamais dans un fichier de passation.

## Désinstaller

```bash
claude plugin uninstall metaswarm@metaswarm-marketplace
claude plugin marketplace remove metaswarm-marketplace
```
