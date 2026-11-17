---
title: Documents générés par l'agent
sidebar_position: 12
---

# Documents générés par l'agent

Décision du propriétaire (2026-11-17, sans ticket Jira) : l'agent produit à la demande des fichiers Word, PowerPoint et Excel, avec des composants libres et locaux, sans nuage.

## Architecture

| Élément | Choix | Pourquoi |
|---|---|---|
| Word et PowerPoint | `mcp-ms-office-documents` (MIT), image `georgx22/mcp-office-docs` épinglée par empreinte (service `mcp-office`) | Serveur MCP sans exécution de code ; seuls `create_word_from_markdown`, `create_powerpoint_presentation`, `list_presentation_templates` et `create_excel_from_markdown` sont exposés (liste blanche) |
| Classeurs Excel | `excel-mcp-server` 2.3.2 (MIT), image construite par `mcp-excel/Dockerfile` (service `mcp-excel`) | Mise en forme, tableaux, graphiques et formules ; sept outils exposés, tous ne prenant qu'un nom de classeur |
| Réseau | `docs-net`, interne (sans Internet), service IA et deux serveurs seulement | Aucun accès sortant ni exposition au navigateur |
| Secret | `IA_BUREAUTIQUE_CLE`, partagé par le service IA et les deux serveurs | Un serveur sans clé n'est pas joignable |
| Compétences | `documents` et `tableur` (`competences/`), routées comme les autres | Sélection juste-à-temps, 7 outils au plus par compétence |
| Livraison | Fichier rangé dans le Store sous `/espace/documents/` (base64), téléchargé par les routes existantes `/ia/fichiers` | Même espace, même isolation, même quota que les autres fichiers de l'agent |

Les trois serveurs partagent un seul processus par type : l'isolation entre utilisateurs repose sur un préfixe `sha256(utilisateur)[:16]__` ajouté au nom du classeur par le middleware (le modèle ne voit jamais le préfixe) et sur la liste blanche d'outils (pas de liste de classeurs, d'import, d'image ni d'e-mail).

## Code maison déclaré

`ia/src/staport_ia/bureautique.py` (~250 lignes) : liste blanche des outils MCP, préfixe d'identité, interception du résultat avant le modèle (le fichier n'entre jamais dans son contexte), rangement dans le Store avec les bornes de `QuotaEspace` (25 Mo par fichier, 50 fichiers) et signalement d'audit `ECRITURE_FICHIER_AGENT`. Il s'appuie sur le crochet officiel `wrap_tool_call` d'`AgentMiddleware`. Aucun framework n'offre ce rangement par identité ; à retirer si Deep Agents ou le serveur MCP le fournit.

Pas d'accord interactif avant la génération : la demande de l'utilisateur vaut accord, le fichier n'écrase rien d'important (remplacement d'un fichier de même nom seulement) et reste dans son espace privé.

## Vérifié

- Tests unitaires (`ia/tests/test_bureautique.py`) : isolation, liste blanche, interception, bornes, audit, panne d'un serveur.
- Essai réel (2026-11-17) contre les deux serveurs en conteneurs durcis (`read_only`, `cap_drop ALL`, `no-new-privileges`) : classeur, document Word et présentation rangés dans le Store, répertoire de sortie vide ensuite.

**Non vérifié :** rendu visuel des fichiers dans Word, PowerPoint et Excel ; panneau de fichiers du navigateur (liste et téléchargement d'un document binaire, rafraîchissement après génération) ; protocole d'évaluation de l'agent (contexte, latence, sûreté des schémas) avec un vrai modèle ; droits d'écriture du volume `docs_sortie` pour l'utilisateur du service IA en production.
