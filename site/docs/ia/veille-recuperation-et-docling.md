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

## 6. Premier essai de Docling sur le corpus (2026-11-23, amorce de KAN-290)

Docling 2.151.1, Python 3.12, **CPU seul**, réglages par défaut (détection de mise en page, structure des tableaux, RapidOCR), sur quelques pages de chaque document. Un essai, pas un banc d'essai : aucune fidélité n'est mesurée contre une transcription de référence, les durées sont celles d'une seule exécution sur ce poste, et le premier passage inclut le chargement des modèles.

| Document | Pages | Secondes par page | Résultat |
|---|---|---|---|
| Code du travail, français (pages 1 à 15) | 15 | 14,9 | Texte courant propre ; 21 titres ; chaque article (`Article 2`, `Article 3`…) est détecté comme titre |
| Circulaire DGI 737 (pages 1 à 10) | 10 | 5,7 | Texte lisible, 22 titres ; 1 seul tableau reconnu (un exemple chiffré) : les tableaux du barème sont à tester sur les pages concernées |
| Recueil CNSS, arabe (pages 1 à 5) | 5 | 5,7 | Texte arabe lu correctement, 3 tableaux (index) ; deux images (couverture) |
| Code du travail, arabe (pages 20 à 24), **lecture du texte intégré** | 5 | 4,0 | 18 titres `المادة N` ; mots dans le bon ordre ; **espaces parasites à l'intérieur des mots** (« يم ك ن ») |
| Même PDF, **OCR EasyOCR arabe forcé** | 5 | 85,2 | **Ordre des mots brouillé et lettres perdues** : inutilisable pour citer un article |

**Conséquences (à confirmer au banc d'essai) :**

- Le « texte illisible » de `pdftotext` sur le PDF arabe du Code du travail n'est pas un problème de scan : Docling relit la couche de texte et obtient un texte lisible. L'OCR est ici **moins bon** que la couche intégrée et vingt fois plus lent : à ne pas utiliser sur ce document.
- Les espaces à l'intérieur des mots dégraderaient une recherche lexicale (BM25) en arabe ; à mesurer, et à comparer à une normalisation du texte ou à une autre source (par exemple la copie du Code du travail du CNCLT).
- Le PDF français a un titre dupliqué lettre par lettre (« L LO OI I N N° °6 65 5… ») : artefact de la couche de texte du titre ; sans effet sur les articles.
- Livre, titre et article sortent **au même niveau** de titre : pour un index en arbre à deux niveaux, la hiérarchie doit être reconstruite (le modèle de niveaux de titres de Docling est à essayer) ; `Titre III : … Article 9` est aussi parfois fusionné dans un seul titre.
- À 15 s par page sur CPU, le Code du travail complet en français (environ 200 pages) prendrait de l'ordre de 50 minutes, sans GPU : acceptable pour une importation en tâche de fond avec avancement visible, pas pour une réponse en direct.
- Non testés : le recueil CNSS au-delà de la page 5, les tableaux de barèmes, les pages numérisées, `docling-serve`, le modèle de vision (VLM) de Docling.

## 7. Essai complémentaire : tableaux, scans, service HTTP, modèle de vision (2026-11-23)

Même poste (CPU seul), mêmes versions (docling 2.151.1, docling-serve 1.38.2). Référence : pages 118 et 119 du Code général des impôts 2026 (article 73 : barème de l'IR en liste, puis tableau des droits complémentaires), dont la valeur exacte a été relevée dans le texte intégré du PDF. Les « scans » sont des **simulations** (page rendue en image, légère rotation, flou) : un seul exemplaire par cas, pas une mesure sur de vrais scans.

| Essai | Résultat |
|---|---|
| Tableau des droits complémentaires (texte intégré) | **8 lignes sur 8 exactes**, 3 colonnes |
| Barème de l'IR (texte intégré) | 6 lignes sur 6 présentes avec leurs taux et seuils |
| Scan du tableau, 100 dpi, **EasyOCR** français forcé | 16 valeurs sur 16 retrouvées, mais le détecteur de la section 8 signale 11 % d'encre non lue (notes de bas de page manquantes) |
| Scan du barème, 150 dpi, **EasyOCR** français forcé, 56 s | **9 valeurs sur 11** : la ligne « jusqu'à 40 000 dirhams est exonérée » et le seuil 100.000 sont perdus ; mots déplacés (« qui ») |
| Mêmes scans, **RapidOCR** (moteur par défaut de Docling), 6 à 23 s | Barème : **11 valeurs sur 11** ; tableau : 1,8 % d'encre non lue. **Correction :** le « 9 sur 11 » ci-dessus venait d'EasyOCR, que j'avais forcé, et non du moteur par défaut |
| Même scan, modèle de vision GraniteDocling (transformers, CPU), 393 s | **11 valeurs sur 11**, ordre correct, barème complet |
| `docling-serve` (HTTP, `POST /v1/convert/file`, `page_range`) | Même texte que la bibliothèque (4 856 caractères), 19 s pour 2 pages (traitement 14 s) |

**Conséquences (à confirmer au banc d'essai) :**

- Sur les PDF avec texte intégré, qui sont la grande majorité de notre corpus, la lecture est exacte pour les tableaux testés et rapide (4 à 6 s par page). C'est le chemin par défaut.
- Sur un scan, un OCR peut **perdre une ligne entière** sans signal d'erreur (EasyOCR l'a fait ; le moteur par défaut, RapidOCR, non, sur ce seul exemple) : sur un barème, un seuil manquant fausse un calcul. Un document numérisé ne doit donc pas entrer dans la base de connaissances sans contrôle (par exemple : lecture par le modèle de vision, ou contrôle des totaux et des seuils, ou validation humaine pour les textes à chiffres).
- Le modèle de vision est le plus fidèle sur ce scan mais environ sept fois plus lent que l'OCR et soixante-dix fois plus que le texte intégré : réservé aux pages sans texte intégré, en tâche de fond, ou à un GPU.
- `docling-serve` est utilisable tel quel pour isoler la lecture dans un service : l'ingestion appelle une API plutôt que d'embarquer Docling (et ses modèles, 1,2 Go d'environnement) dans le service de l'agent.
- Limites : une page par cas, scans simulés, aucune mesure sur des scans réels ni sur l'arabe numérisé, durée mesurée sur une seule exécution.

## 8. Lecture sans perte silencieuse : exigence de production et première défense (2026-11-23)

**Exigence du propriétaire :** rien ne doit être raté dans les documents indexés, et aucune erreur ne doit passer sans signal. Aucun lecteur (Docling, OCR, modèle de vision) ne garantit à lui seul de ne rien perdre ; la garantie vient de **contrôles indépendants du lecteur** et d'une règle : **un document n'est activé que si ses contrôles passent**, sinon il reste en quarantaine pour validation humaine.

### Défense 1 (prototypée) : encre de la page non couverte

Principe : on rend chaque page en image, on repère les pixels sombres, on retire ceux qui tombent dans la boîte d'un élément lu (texte, tableau, image, avec marge), et on mesure ce qui reste. Une zone d'encre sans texte associé est une perte probable. Le contrôle ne dépend d'aucun moteur de lecture.

| Lecture | Valeurs clés | Encre non couverte | Zones suspectes |
|---|---|---|---|
| Page de référence (vecteur, EasyOCR) | 11/11 | 3,4 % | 4 (en-tête, pied de page) |
| Scan barème, RapidOCR, échelle 1 ou 2 | 11/11 | 1,4 % | 3 (en-tête, numéro de page) |
| Scan barème, EasyOCR | 9/11 | **11,4 %** | 7, dont une de 33 px de haut et 3 638 px d'encre au milieu de la page (la ligne perdue) |
| Scan tableau, RapidOCR | | 1,8 % | 2 (pied de page) |
| Scan tableau, EasyOCR | | **11,1 %** | 5, dont une de 133 px de haut (notes de bas de page perdues) |

Lecture : le détecteur sépare nettement les lectures saines (1 à 3 %, zones seulement en marge) des lectures avec perte (11 %, grandes zones dans le corps de la page). Il a aussi trouvé une perte (notes de bas de page) que le contrôle par valeurs clés ne voyait pas. **Seuil de départ proposé** (à calibrer sur plus de pages) : alerte si plus de 5 % d'encre n'est pas couverte, ou si une zone de plus de 800 px d'encre se trouve hors des marges haute et basse.

Limites : prototype sur 4 pages dont 2 scans simulés ; les pieds de page et en-têtes donnent de petites zones à exclure ; le contrôle voit l'encre manquante, pas un mot mal lu.

### Chaîne cible (à valider au banc d'essai et en E14.A10)

1. **Texte intégré d'abord.** Si la page a une couche de texte fiable, on la lit directement (exact sur les tableaux testés, 4 à 6 s par page).
2. **Contrôle de couverture sur chaque page** (défense 1). Pour un PDF à texte intégré, on compare aussi le texte lu au texte intégré brut (caractères, nombres).
3. **Contrôles de structure pour les textes juridiques :** suite des numéros d'articles sans trou ni doublon ; sous-totaux et tranches de barèmes cohérents ; renvois (« article X ») qui pointent vers un article existant.
4. **Double lecture sur les pages à risque** (scans, pages avec chiffres) : deux lecteurs indépendants (OCR et modèle de vision) ; tout écart sur un nombre, un seuil ou un article envoie la page en revue.
5. **Quarantaine et validation humaine :** le volet « Connaissances » montre côte à côte l'image de la page et le texte lu, avec les zones suspectes surlignées ; le document n'est activé qu'après validation, et la version précédente reste active jusque-là.
6. **Traçabilité :** image de chaque page, document lu sans perte, résultats des contrôles et nom du validateur conservés avec la version.
7. **Évaluation continue :** les pages contrôlées enrichissent le jeu de référence ; la porte de non-régression en CI rejoue la lecture.

Ce que cette chaîne **ne garantit pas** : un mot mal lu qui ne change ni l'encre ni la structure. Pour les chiffres (barèmes, taux, plafonds), la double lecture et la validation humaine sont le filet ; ce risque résiduel est à mesurer, pas à déclarer nul.
