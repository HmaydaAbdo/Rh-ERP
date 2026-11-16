---
title: Gestion documentaire intelligente (étude)
sidebar_position: 14
---

# Gestion documentaire intelligente : étude des techniques et architecture cible

Cadrage de l'épopée **E14 — Gestion documentaire intelligente, RAG et assistant réglementaire** (KAN-27 ; décision du propriétaire, 2026-11-16 : une seule épopée pour le sujet) : comprendre comment l'industrie traite les documents avec l'IA (analyse, indexation, recherche, citation, extraction), comparer les outils et les architectures, puis choisir la combinaison la plus **précise** et la plus **efficace** pour Staport Intelligence. L'assistant réglementaire (Code du travail, CNSS/AMO, procédures internes) est le premier cas d'usage de la chaîne que cette épopée construit.

:::info Nature de ce document
Étude de départ, rédigée à partir d'une veille du 2026-11-16. **Les chiffres cités viennent en majorité de blogs, de fournisseurs et d'articles non rejoués** : ils orientent, ils ne tranchent pas. Chaque choix se décide sur un **banc d'essai à nous** (documents réels de Staport, français et arabe), jamais sur un classement publié. Les sources sont en bas de page.
:::

## 1. Ce qui existe aujourd'hui dans le projet

| Capacité | État | Où |
|---|---|---|
| Pièces jointes à une question (images, PDF, Word, Excel, PowerPoint, texte, CSV, Markdown, JSON ; 500 Mo) | **En place**, éphémères : le fichier vit le temps de la conversation | [Pièces jointes et voix](pieces-jointes-et-voix.md) |
| Antivirus (ClamAV), contrôle de signature, échec fermé | En place | `ia/src/staport_ia/pieces_jointes.py` |
| Conversion en texte pour tous les modèles (MarkItDown) | En place, **volontairement simple** : texte plat tronqué à 300 000 caractères | `ia/src/staport_ia/documents.py` |
| PostgreSQL 18 avec l'extension `pgvector` | Activée, **aucun usage** tant qu'un cas RAG n'est pas validé | [Vue d'ensemble](../architecture/vue-d-ensemble.md) |
| Traces (Phoenix), évaluation de l'agent (E20), droits par fiche de poste (E9) | En place ou prévus | autres pages IA |

Ce qui **manque** : un stockage durable des documents, leur indexation, la recherche, les citations vérifiées au niveau de la page, la gestion des versions et des droits par document, et une évaluation de la qualité de lecture.

## 2. Trois usages à ne pas mélanger

| Usage | Exemple | Exigence dominante |
|---|---|---|
| **A. Pièce jointe éphémère** | « Résume ce PDF » | Rapidité, aucune persistance, confidentialité |
| **B. Base de connaissances** | Code du travail, CNSS/AMO, procédures internes, aide métier | Précision, citations, mise à jour, droits |
| **C. Extraction structurée** | Contrat → dates, montants, parties ; bulletin → lignes de paie | Exactitude champ par champ, validation humaine |

L'usage A est livré. E14 couvre B et C, avec une chaîne d'ingestion commune.

## 3. Ce que fait l'industrie (veille)

### 3.1 Lecture des documents (parsing, OCR)

La qualité de tout ce qui suit dépend de cette étape : un tableau mal lu donne un RAG faux, quel que soit le modèle.

| Famille | Outils | Ce que disent les sources | À vérifier chez nous |
|---|---|---|---|
| **Boîte à outils de conversion** | **Docling** (IBM, projet ouvert ; sortie `DoclingDocument` sans perte, `HybridChunker`, modèle Granite-Docling 258 M, version 2.150.1 le 2026-11-14) ; MarkItDown (utilisé aujourd'hui) ; Unstructured | Docling est le plus complet pour la structure et le découpage ; MarkItDown est plus léger mais aplatit la structure | Tableaux, listes, en-têtes de textes juridiques |
| **Modèles de vision pour OCR (VLM)** | PaddleOCR-VL (0,9 B), MinerU 2.5-Pro, dots.ocr, DeepSeek-OCR, olmOCR, LightOnOCR-2, GLM-OCR | OmniDocBench (v1.7, avril 2026) place PaddleOCR-VL-1.6 et MinerU2.5-Pro autour de 95-96 ; ils s'auto-hébergent (GPU conseillé) ; **licences à lire** (poids de MinerU et Marker sous conditions commerciales) | Scans, tampons, manuscrits, **arabe et mélange français/arabe** |
| **Services cloud** | LlamaParse, Mistral OCR, Azure Document Intelligence, Google Document AI, AWS Textract, Reducto | Meilleurs sur les cas difficiles, mais le document **quitte nos serveurs** | Écartés par défaut pour les corpus confidentiels (CNDP) ; admis seulement pour des corpus publics, après décision |
| **Modèles généralistes multimodaux** | Gemini, GPT, Claude lisant la page en image | Bons sur les tableaux imbriqués, coûteux à grande échelle, mêmes réserves de confidentialité | Rôle de **secours** sur les pages que le parseur local réussit mal |

Points d'attention : les classements publiés **ne sont pas comparables entre eux** (jeux de données, versions et métriques différents) et plusieurs viennent d'éditeurs qui vendent le produit classé. L'**arabe reste le point faible** de la plupart des moteurs (sens de lecture, mots coupés, texte bidirectionnel, tableaux) ; un VLM s'en sort nettement mieux qu'un OCR classique, sans atteindre la perfection (KITAB-Bench : environ 65 % en conversion PDF vers Markdown pour le meilleur modèle testé).

### 3.2 Découpage (chunking) et contexte

- Défaut défendable : **découpage fondé sur la structure** du document (titres, sections, tableaux gardés entiers) avec chunks parents et enfants. Docling fournit ce découpage.
- Le découpage « sémantique » par modèle n'a pas montré d'avantage net : une étude de reproduction (février 2026) trouve que les méthodes simples gagnent en recherche dans un corpus, et que le contexte ajouté aide dans le corpus mais nuit dans un document.
- **Récupération contextuelle** (préfixe de contexte généré par un LLM avant l'indexation, Anthropic 2024) : gain annoncé important en réduction des échecs de recherche, **à confirmer** sur nos textes ; coût d'indexation non nul.
- Late chunking : gain modeste (environ 3 % relatif selon un résumé secondaire) ; à tester seulement face à un problème précis de perte de contexte.

### 3.3 Représentation et stockage

| Brique | Constat de la veille | Pour nous |
|---|---|---|
| **Embeddings** | Qwen3-Embedding (4 B, 8 B), BGE-M3, EmbeddingGemma, Octen-8B en tête des classements multilingues ; licences MIT ou Apache pour les principaux | BGE-M3 : point de départ le plus sûr pour le français (8 192 jetons, MIT) ; **tester** Qwen3-Embedding et un modèle arabe ; ne retenir que ce que nous pouvons héberger |
| **Reranker** (cross-encoder) | Étape standard : recherche large (50 à 100) puis re-classement (5 à 10), gain de précision important pour environ 100 ms | À intégrer dès la première version |
| **Recherche hybride** (BM25 + vecteurs, fusion RRF) | Considérée comme la base de production en 2026 : le vecteur seul rate les termes exacts (numéros d'article, sigles) | Obligatoire : un texte de loi se cite par numéro |
| **Base** | pgvector suffit sous environ 50 millions de vecteurs ; Qdrant offre le meilleur filtrage et l'hybride natif ; pgvectorscale et VectorChord améliorent pgvector ; ParadeDB (`pg_search`) apporte BM25 dans PostgreSQL | **Rester dans PostgreSQL** (déjà là, droits, sauvegarde, audit, une seule base) ; Qdrant en recours si le volume ou les filtres l'imposent |
| **Récupération visuelle** (ColPali, ColQwen, vecteurs multiples par page) | Meilleure sur les pages très visuelles (ViDoRe : 81 contre 65 pour OCR + BM25, chiffres d'une seule publication) ; stockage 100 à 1 000 fois plus gros, GPU conseillé | Hors périmètre initial ; à garder en option pour les plans, schémas et scans de mauvaise qualité |

### 3.4 Stratégie de récupération

- **RAG en une passe** : suffit pour la plupart des questions de recherche d'information.
- **RAG agentique** : l'agent classe la question, choisit l'outil (recherche textuelle, SQL, graphe), relance, vérifie. Tendance forte en 2026 ; coûteuse en latence, à réserver aux questions complexes. Les agents de code abandonnent en partie la recherche vectorielle au profit de la recherche textuelle exacte et de la lecture ciblée : bon signe pour un corpus **borné et structuré** comme un recueil de textes juridiques, moins pour de très gros corpus.
- **Contexte long** : n'élimine pas la recherche (coût, bruit, « perdu au milieu »), mais permet de **lire un document entier** quand il est borné : c'est la fonction actuelle des pièces jointes.
- **GraphRAG** (Microsoft GraphRAG, LightRAG, HippoRAG) : utile pour les questions à plusieurs sauts ou les agrégations entre entités ; **moins bon que le vecteur re-classé sur la recherche d'un fait ou d'une clause** (GraphRAG-Bench, ICLR 2026) et bien plus cher à l'interrogation. Décision par défaut : **non**, à rouvrir si un cas métier relationnel le réclame.

### 3.5 Plateformes toutes faites

| Plateforme | Positionnement | Lecture |
|---|---|---|
| Onyx | Application d'entreprise complète, annoncée sensible aux droits des sources | Un produit entier à côté du nôtre : concurrent, pas brique |
| RAGFlow | Compréhension profonde des documents, citations ancrées | Intéressant pour **comparer** la qualité de lecture |
| Dify, Haystack, LlamaIndex | Constructeur visuel, cadres de développement | LlamaIndex et Haystack : bibliothèques possibles ; Dify : hors principe « l'interface agentique est la nôtre » |
| API gérées (Gemini File Search, OpenAI `file_search`, Vertex, Azure AI Search) | RAG géré : découpage, vecteurs et recherche chez le fournisseur ; Gemini : citations par page, filtres de métadonnées, indexation environ 0,15 $ par million de jetons | **Rapide à mettre en place, mais les documents quittent nos serveurs** : au mieux un banc de **comparaison de qualité**, jamais la cible pour les données de paie ou de personnel |
| GED open source (Paperless-ngx, Mayan EDMS, Alfresco, Nuxeo) | Archivage, versions, métadonnées, OCR, recherche plein texte | Référence pour le **cycle de vie** (versions, rétention, signature) ; à étudier si nous construisons ou intégrons |

### 3.6 Sécurité propre au RAG

- **Les droits se vérifient à la recherche, avant le modèle** : le filtre par document (ou par chunk) est appliqué dans la requête, la décision de droit vient de notre contrôle d'accès, pas des identifiants du moteur de recherche. C'est déjà le principe du projet (droits filtrés avant le modèle).
- **Injection indirecte** : un document peut contenir des instructions cachées. Tout contenu récupéré est une **donnée non fiable**, jamais une consigne ; valider l'origine à l'ingestion (empoisonnement de la base).
- **Isolation** des fuites entre domaines (paie, personnel, juridique) et chiffrement des vecteurs, qui peuvent être inversés (OWASP LLM08).

### 3.7 Évaluation

Mesures reconnues : fidélité à la source, pertinence de la réponse, précision et rappel du contexte, attribution des citations. RAGAS (référence des métriques), DeepEval (intégration en CI), TruLens, ARES. Un point à vérifier avant adoption : **la maintenance de RAGAS est contestée** dans une des sources (dernière version en janvier 2026, une faille signalée) ; la règle d'`AGENTS.md` sur la dernière version stable et la veille s'applique. Un **jeu de référence de 200 à 300 questions** étiquetées suffit pour valider les juges automatiques. Phoenix et l'évaluation de l'agent (E20) existent déjà et se réutilisent.

## 4. Architecture cible proposée (à valider par le banc d'essai)

```
Dépôt ─► Contrôles ─► Lecture ─► Structure ─► Découpage ─► Index ─► Recherche ─► Réponse
(UI/API) (antivirus,   (Docling   (DoclingDoc  (structure,  (PostgreSQL : (hybride,   (citations
         signature,    + VLM OCR   JSON, images  parents/     pgvector +   re-classement, page + zone,
         doublon,      en secours) de pages)     enfants,     plein texte, droits avant  vérifiées)
         quarantaine)                            contexte)    métadonnées  le modèle)
                                                              + droits)
                         Évaluation continue (jeu de référence, Phoenix, porte en CI)
```

Principes :

1. **Un seul chemin d'ingestion**, plusieurs usages (A, B, C). Les pièces jointes éphémères gardent le chemin léger actuel (MarkItDown) ; la base de connaissances passe par Docling.
2. **Rester dans PostgreSQL** tant que le volume le permet : un seul système de droits, de sauvegarde et d'audit.
3. **Conserver le document lu sans perte** (`DoclingDocument`) et l'image de chaque page : on peut réindexer avec un meilleur modèle sans relire les fichiers, et citer la page et la zone exactes.
4. **Local par défaut** : parseur, embeddings, reranker et modèle d'extraction hébergés chez nous ; un service cloud n'entre que sur décision explicite, pour un corpus public.
5. **Bibliothèques officielles d'abord** (règle « 0 % de code maison ») : Docling pour la lecture et le découpage, LangChain pour la récupération, l'abstraction de recherche choisie dans le registre d'`ingenierie-agentique.md`. L'agent y accède par **MCP**, protégé par les droits du domaine.
6. **Évaluer avant d'optimiser** : le jeu de référence existe avant le premier choix d'embeddings.

## 5. Questions ouvertes (décidées par le banc d'essai, pas par la veille)

1. Docling seul suffit-il sur nos scans et nos documents en arabe, ou faut-il un VLM d'OCR (PaddleOCR-VL, MinerU, LightOnOCR) en renfort ?
2. Quel embedding en français et en arabe (BGE-M3, Qwen3-Embedding, autre) pour quel coût matériel ?
3. pgvector + plein texte natif suffit-il, ou faut-il `pg_search` (BM25) ? Et à partir de quel volume Qdrant ?
4. La récupération contextuelle apporte-t-elle assez de précision pour son coût d'indexation ?
5. Où l'agentique remplace-t-elle la recherche en une passe (textes juridiques : lecture ciblée par article) ?
6. Le matériel disponible (CPU seul aujourd'hui) autorise-t-il un VLM d'OCR en local, ou faut-il un GPU ?
7. Quels documents le propriétaire autorise-t-il à traiter hors de nos serveurs, s'il en existe ?

## 6. Découpage de l'épopée

| Phase | Contenu | Livrable |
|---|---|---|
| **P0. Cadrage** | Corpus réels, volumes, confidentialité, cas d'usage B et C, métrique de réussite | Inventaire et jeu de référence |
| **P1. Banc d'essai** | Parseurs, embeddings et rerankers, stockage et recherche, découpage, récupération agentique, plateformes | Rapport chiffré sur nos documents |
| **P2. Décision** | Architecture cible, ADR, mise à jour de E14 | Décisions dans `site/docs/decisions/` |
| **P3. Socle** | Dépôt, ingestion, index, droits par document, citations | Chaîne en production sur un premier corpus |
| **P4. Extraction structurée** | Usage C, validation humaine | Un cas métier de bout en bout |
| **P5. Exploitation** | Réindexation, versions, rétention, supervision, évaluation en CI | Page d'exploitation à jour |

Le détail des tâches est dans Jira (projet `KAN`, épopée KAN-27) : l'étude E14.A1 à E14.A10 (KAN-289 à KAN-298), puis la construction E14.1 à E14.10 (KAN-109 à KAN-118), révisée par la décision E14.A10.

## Sources

- [Docling : version 2.150.1 (GitHub)](https://github.com/docling-project/docling/releases)
- [Docling : article de présentation (arXiv 2501.17887)](https://arxiv.org/pdf/2501.17887)
- [IBM : Granite-Docling](https://ibm.com/new/announcements/granite-docling-end-to-end-document-conversion)
- [Docling : découpage](https://ds4sd.github.io/docling/concepts/chunking)
- [OmniDocBench (CVPR 2025, v1.7)](https://github.com/opendatalab/OmniDocBench)
- [PaddleOCR-VL-1.6 (arXiv 2606.03264)](https://arxiv.org/pdf/2606.03264)
- [MinerU2.5-Pro (arXiv 2604.04771)](https://arxiv.org/pdf/2604.04771)
- [Meilleur OCR local 2026 (synthèse)](https://pasqualepillitteri.it/en/news/25568/best-local-ocr-pc-server-2026)
- [LlamaIndex : comparatif OCR 2026 (éditeur, non neutre)](https://www.llamaindex.ai/agents/best-ocr-models-in-2026-accuracy-speed-and-cost-compared)
- [KITAB-Bench : OCR arabe](https://preview.aclanthology.org/watermark/2025.findings-acl.1135)
- [Architecture RAG 2026](https://futureagi.com/blog/rag-architecture-llm-2025/)
- [RAG d'entreprise 2026](https://www.atolio.com/blog/enterprise-rag-guide)
- [Chunking : taxonomie et évaluation (arXiv 2602.16974)](https://arxiv.org/abs/2602.16974)
- [Chunking : ce que montrent les bancs d'essai (Splunk)](https://www.splunk.com/en_us/blog/artificial-intelligence/chunking-techniques.html)
- [Qwen3 Embedding (arXiv 2506.05176)](https://arxiv.org/pdf/2506.05176)
- [Robustesse des classements d'embeddings multilingues (arXiv 2605.31142)](https://arxiv.org/pdf/2605.31142)
- [MTEB-French (arXiv 2405.20468)](https://arxiv.org/html/2405.20468v2)
- [Comparatif des bases vectorielles, T2 2026](https://actian.com/blog/developer/state-of-vector-databases-q2-2026/)
- [pgvector contre Qdrant (TigerData, éditeur de pgvectorscale)](https://www.tigerdata.com/blog/pgvector-vs-qdrant)
- [ColPali et ColQwen : récupération visuelle](https://mixpeek.com/visual-document-retrieval)
- [GraphRAG contre RAG vectoriel : coût et précision](https://www.beri.net/article/graphrag-vs-vector-rag-indexing-query-cost-lightrag-lazygraphrag-2026)
- [GraphRAG en production](https://tianpan.co/blog/2026-04-09-graphrag-production-when-vector-search-hits-ceiling)
- [Recherche agentique contre RAG](https://dev.to/pueding/is-grep-all-you-need-grep-vs-vector-retrieval-for-agentic-search-534k)
- [Onyx : plateformes RAG d'entreprise 2026 (éditeur)](https://onyx.app/insights/enterprise-rag-platforms-2026)
- [Gemini API : File Search](https://blog.google/innovation-and-ai/technology/developers-tools/file-search-gemini-api/)
- [Sécuriser les flux RAG (Okta)](https://www.okta.com/identity-101/how-to-secure-rag-workflows/)
- [Injection indirecte et empoisonnement (Prediction Guard)](https://predictionguard.com/blog/rag-security-indirect-prompt-injection-and-knowledge-base-poisoning)
- [Évaluation RAG : RAGAS, TruLens, DeepEval](https://www.analyticsvidhya.com/blog/2026/07/rag-evaluation-frameworks/)
