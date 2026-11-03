# Leçons apprises : erreurs à ne pas répéter

Ce document consigne les erreurs réellement commises dans ce dépôt et la règle qui les évite. **Toute nouvelle erreur
ou surprise coûteuse y ajoute une ligne dans le commit qui la corrige** : on apprend de ses erreurs en les écrivant une
seule fois, ici. Format : constat, cause, règle.

## Suivi et livraison

| Constat | Règle |
|---|---|
| Le suivi dans des fichiers markdown (plan de 600 lignes, handoff, tableaux d'état) divergeait du code et se contredisait d'une reprise à l'autre. | Le suivi d'une tâche vit dans Jira (projet `KAN`) et l'état technique dans le code et les tests. Aucun fichier markdown ne suit l'avancement ; une décision durable va dans la convention ou le document de conception concerné. |
| Une branche partait de la mauvaise base, des commits restaient locaux, la PR n'était pas à jour. | Avant tout `git` ou `gh` : vérifier le dossier courant, la branche et `git status`. Une seule branche de travail et une PR à la fois ; après fusion, ne garder que `main`. |
| Une CI verte sur un ancien commit a été prise pour une validation. | Les 4 contrôles requis (`backend`, `frontend`, `full-stack`, `ia`) doivent être verts sur le **dernier commit poussé**. |
| Un refus automatique d'une commande a été contourné par une autre voie. | Un refus n'est jamais contourné : donner la commande au propriétaire, ou lui demander d'ajouter la règle de permission. |
| Un ticket de mesure (KAN-9, démarrage du service `ia`) a été clos après la seule mesure de l'import, sans mesurer le démarrage complet du conteneur. | Avant de clore, comparer ce qui a été mesuré à ce que le titre promet ; ce qui ne l'est pas est mesuré ou écrit « non vérifié », et le ticket reste ouvert tant qu'il manque. |
| Plusieurs tâches avançaient en parallèle pendant l'attente de la CI. | Une tâche va jusqu'à « Terminé(e) » (fusion, branche supprimée, preuve) avant d'ouvrir la suivante ; pendant l'attente, lecture et mesures sans branche seulement. |
| Une tâche était annoncée « faite » sans preuve. | Une tâche passe à « Terminé(e) » en Jira seulement avec sa preuve en commentaire (test, trace, capture, lien de PR). Ce qui n'a pas été vérifié est écrit « non vérifié ». |

## Outils et scripts

| Constat | Règle |
|---|---|
| Un heredoc Bash a altéré des antislashs et des guillemets dans un fichier. | Écrire les fichiers avec les outils `Write` et `Edit`, jamais avec un heredoc ou `echo`. |
| Les fins de ligne CRLF ont fait échouer silencieusement un remplacement sur plusieurs lignes. | Vérifier le résultat d'un remplacement multi-lignes ; normaliser les fins de ligne avant de remplacer par script. |
| Un fichier a été écrasé par erreur. | Le restaurer avec `git checkout -- <fichier>` puis le réécrire ; lire un fichier avant de l'écraser. |
| `transitionJiraIssue` a échoué avec `transition` au lieu de `transitionId`, puis avec un identifiant qui n'était pas valable pour le ticket (10005 refusé sur une tâche en « Revue en cours » ; 41 accepté). | Passer `transitionId` ; ne jamais fixer un numéro de mémoire : les transitions valides dépendent du statut courant du ticket. Lire `allowedValues` dans l'erreur et en reprendre l'identifiant. |
| Une recherche récursive sur tout le dépôt a dépassé le délai. | Utiliser l'outil `Grep`/`Glob` avec un dossier ou un motif ciblés, ou lancer la commande longue en arrière-plan. |

## Tests et qualité

| Constat | Règle |
|---|---|
| Une mesure de débordement horizontal dans les e2e lisait la page avant le rendu du contenu. | Attendre un élément rendu (titre, ligne de tableau) avant de mesurer ou d'ouvrir une palette de commandes (`Ctrl+K`). |
| Le premier lancement de `ng serve` rendait des e2e instables. | Attendre le titre de la page avant d'interagir ; relancer avec `--workers=1` avant de soupçonner une régression. |
| Des vulnérabilités critiques transitives (npm) bloquaient la CI. | Les corriger par `overrides` dans `package.json` (par exemple `dompurify`), pas en retirant le contrôle. |
| Un défaut d'une bibliothèque tierce (A2UI avec zod 4) a été contourné sans être signalé. | Contourner par un repli lisible côté ERP **et** ouvrir un signalement chez l'éditeur (texte anglais, reproduction minimale) ; consigner son lien dans la tâche Jira. |
| Le comportement d'un framework a été affirmé de mémoire. | Lire la page officielle ou le code source en entier avant d'affirmer ; sinon écrire « non vérifié » (règle d'`AGENTS.md`). |
| Un tableau a été livré avec un tri qui ne changeait que la page affichée, des vues sans recherche et sans export. | Tri, recherche et export PDF (mêmes filtres et tri que l'écran) sont exigés dans tout tableau et tout domaine, y compris pendant une migration : voir `conventions/frontend.md`, section « Tri, recherche et export ». |
| Des tests unitaires ont été réécrits pour passer au lieu de corriger la cause. | Corriger la cause ; ne pas affaiblir une assertion métier. |
| Une borne de contexte (7 outils par compétence) a été présentée comme une limite de capacité, ce qui a fait craindre des scénarios sans outil. | Écrire dans la règle ce que le nombre borne (schémas par domaine) et ce qu'il ne borne pas (le total d'un tour, les domaines atteignables par le repli) ; un test de couverture prouve que chaque scénario garde ses outils. |
| Un test d'API lançait le vrai modèle d'embeddings de routage. | Injecter le routage dans `creer_app` pour les tests d'API ; un seul test charge le vrai modèle (MiniLM, préchargé dans l'image Docker, jamais téléchargé au démarrage). |

## Documentation

| Constat | Règle |
|---|---|
| Des nombres écrits en dur dans la documentation (versions, nombre d'outils MCP, seuils) devenaient faux. | Les faits vérifiables sont dans `scripts/ia/verrous.txt` ; `scripts/ia/check-docs-code.mjs` les compare au code en CI. Un nouveau fait de ce type y est ajouté. |
| Des fichiers supprimés ont perdu des informations utiles. | Avant de supprimer un document, vérifier que chacune de ses informations durables figure ailleurs ; indiquer le commit qui le conserve (`git show <commit>:<chemin>`). |
| Le banc d'évaluation réel contournait le routage (aucune compétence épinglée) : il mesurait le seul repli, +1 tour de modèle presque partout. | Tout banc doit construire l'état d'entrée comme le service (`pinned_skills` calculé par `Routeur`) ; vérifier qu'un changement de chemin d'exécution est bien celui que mesure le banc. |
| Un critère « l'outil exact attendu doit être appelé » faisait échouer des réponses justes par un autre chemin et bridait l'agent. | Le jeu juge le résultat (valeurs, fondement, sécurité, juge) ; la trajectoire est rapportée seulement. Un banc d'un seul passage de 24 cas cachait l'instabilité et les failles (injection, noms d'outils, premier homonyme pris au hasard) : 60 cas jouées 3 fois les ont révélées. |

