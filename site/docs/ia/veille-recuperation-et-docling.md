---
title: Veille de la récupération documentaire et Docling (2026-11-23)
sidebar_position: 16
---

# Veille : approches de récupération, Docling et versions des documents

Complément de l'[étude](etude-gestion-documentaire.md) et du [cadrage](cadrage-gestion-documentaire.md), à la demande du propriétaire (2026-11-23). **Aucune de ces pistes n'est décidée** : la décision se prend en E14.A10 (KAN-298) sur les bancs d'essai. Les chiffres cités viennent de documents de fournisseurs, de blogs et d'articles non rejoués par nous.

## 1. Versions des documents (décision de principe, valable pour tous les documents)

Un volet « Connaissances » de l'application permet d'importer n'importe quel document (Code du travail, textes CNSS et AMO, circulaires, procédures internes). Règles :

1. Chaque document a un titre, un domaine, un type de source et des **versions**.
2. Une réimportation déclarée « nouvelle version de ce document » fait passer l'ancienne à l'état **remplacée** (avec sa date), dans la même transaction que l'activation de la nouvelle.
3. La recherche est filtrée **avant le modèle** sur la version active : l'agent ne peut pas lire une version remplacée.
4. Chaque réponse cite sa version (titre, date, article, page). Une citation vers une version remplacée est rejetée.
5. Les versions remplacées sont conservées pour l'audit et la comparaison, avec la même gestion des droits que le document.

## 2. Docling : état au 2026-11-23

| Paquet | Dernière version stable (PyPI) | Date |
|---|---|---|
| `docling` | 2.151.1 | 2026-11-19 |
| `docling-core` | 2.108.0 | 2026-11-20 |
| `docling-mcp` | 3.5.0 | 2026-11-04 |
| `docling-serve` | 1.38.2 | 2026-10-27 |

Aujourd'hui le projet n'utilise que MarkItDown (`ia/pyproject.toml`) ; Docling n'est pas encore une dépendance.

**Fonctions utiles à notre cas** (documentation lue via Context7, extraits seulement ; lecture complète à faire avant l'ADR) :

- `DoclingDocument` : représentation structurée conservée sans perte, avec la page de chaque élément (`prov`), donc des citations à la page.
- `HybridChunker` : découpe d'abord selon la structure du document (titres, listes, tableaux), puis sépare ce qui dépasse la limite de jetons et fusionne ce qui est trop petit ; `contextualize()` ajoute les titres de section à chaque morceau.
- Niveaux de titres : un modèle de hiérarchie des titres peut être appliqué à un document déjà converti.
- OCR et lecture de pages en images : à mesurer sur notre PDF arabe (KAN-290).
- `docling-serve` : Docling comme service HTTP ; `docling-mcp` : serveur MCP (modes local et distant ; transports stdio, SSE, streamable-http).

**Le MCP de Docling dans cette session.** Il n'est pas branché dans la session de développement actuelle : je n'en ai pas les outils. Pour l'application, la décision de départ est autre : Docling est utilisé **comme bibliothèque dans la chaîne d'ingestion** (ou via `docling-serve`), et l'agent n'accède aux documents que par **nos** outils MCP, protégés par les droits du domaine. Brancher `docling-mcp` directement à l'agent contournerait le contrôle des droits par document.

## 3. Documents très longs : les approches

| Approche | Principe | Atouts | Limites |
|---|---|---|---|
| **Découpage plat + recherche hybride** | Morceaux de ~400 jetons, BM25 + vecteurs (fusion RRF), re-classement | Défaut de production en 2026 selon les sources ; simple ; incrémental | Perd la vue d'ensemble ; une réponse étalée sur plusieurs chapitres est difficile |
| **Index par sommaire (arbre de structure)** | Le document est un arbre (chapitres, sections, articles) ; on retrouve d'abord la bonne section, puis on cherche dedans | Précis sur les textes structurés ; citations naturelles ; l'arbre existe déjà dans `DoclingDocument` | Dépend de la qualité des titres ; arbre à reconstruire à chaque version |
| **PageIndex** (Vectify, open source) | Variante « sans vecteurs » : un LLM navigue dans un arbre de type sommaire et raisonne pour choisir les sections | Traçable (section, page) ; pas de base vectorielle | Chiffres auto-déclarés (98,7 % sur FinanceBench) ; coût et latence du raisonnement non documentés ; l'analyse de PDF complexes passe par leur service payant |
| **RAPTOR** | On regroupe les morceaux, on les résume, récursivement : un arbre de résumés interrogé d'un coup | Meilleur que le plat sur les questions de lecture longue (article ICLR 2024) | Index hors ligne : une mise à jour oblige à regrouper et résumer de nouveau ; coût de résumé |
| **GraphRAG** (et LightRAG, LazyGraphRAG) | Graphe d'entités et de relations extrait par LLM, avec résumés de communautés | Questions globales (« quels thèmes ? ») et relations entre documents | Une comparaison relève un gain marginal de 0,47 point sur les questions ordinaires pour un coût en jetons 44 fois supérieur ; LazyGraphRAG ramène l'indexation à 0,1 % du coût complet (sources secondaires) |
| **RAG agentique** | L'agent lit à la demande, par outils (article précis, section voisine) | Meilleure précision sur les questions complexes | 5 à 20 fois plus de jetons par question (source secondaire) |
| **Routage adaptatif** | Un classeur envoie chaque question vers le pipeline le moins cher qui suffit | Motif émergent | Demande des mesures par type de question |

## 4. Position de départ pour Staport (hypothèse à vérifier)

1. **Votre idée du sommaire est dans la bonne direction pour nos textes** : le Code du travail, les textes CNSS et les circulaires sont des documents à structure forte (livres, titres, articles). Hypothèse : une récupération **à deux niveaux** : (a) choisir la section par son titre et un court résumé (vecteurs + plein texte), (b) chercher les morceaux seulement dans cette section, avec les titres en contexte. À comparer à la recherche plate sur le jeu de référence (KAN-293, KAN-294).
2. **Graphe : pas pour l'instant.** Les relations d'un texte juridique sont surtout des renvois explicites (« conformément à l'article X »), qu'une simple table de liens dans PostgreSQL représente sans GraphRAG. Un graphe ne se justifie que si un cas de question relationnelle entre documents le réclame (KAN-294, décision conditionnelle déjà prévue).
3. **Milliers de pages.** Lecture une seule fois (Docling, `DoclingDocument` conservé), index par version, réindexation sans relecture des fichiers. Le volume (quelques milliers de pages) reste dans PostgreSQL ; le seuil d'un moteur dédié se mesure en KAN-292.
4. **L'agentique en complément** : pour les textes juridiques, lecture ciblée d'un article par un outil MCP (« donne-moi l'article 51 de la version active »), utile quand l'utilisateur cite un numéro.

## 5. Ce que cette veille change dans Jira

- KAN-293 (découpage) : ajouter la comparaison « arbre de structure à deux niveaux » face au découpage plat.
- KAN-294 (récupération) : ajouter PageIndex et RAPTOR aux candidats ; GraphRAG reste conditionnel.
- KAN-298 (décision) : ajouter la gestion des versions (section 1) et le volet « Connaissances » aux tâches de construction.
