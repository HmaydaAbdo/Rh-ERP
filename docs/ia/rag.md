# RAG documentaire : conception proposée

État : **non implémenté**, soumis aux décisions de l’[ADR 0013](../adr/0013-integration-ia-mcp-langgraph-rag.md).
Règles normatives : [convention RAG](../../conventions/rag.md). Le RAG est une méthode de
recherche et de génération, pas un transport réseau ni une source de vérité.

## Deux chemins de réponse

| Question | Source | Réponse vérifiable |
|---|---|---|
| « Comment préparer l’import ? » | Procédure publiée, approuvée et accessible | Passages documentaires cités avec version et date |
| « Quel est l’effectif de ce chantier ? » | Outil MCP de son domaine, agrégat déterministe | Valeur calculée par Spring, période/filtres et référence de requête |
| « Pourquoi l’import est refusé ? » | Erreurs typées du parcours existant + procédure approuvée | Motif métier exact et explication sourcée ; aucun changement silencieux |

Une réponse mixte garde les deux provenances distinctes. Les données employés/paie et les KPI
ne sont pas copiés dans des chunks, des vecteurs ou un graphe. Le modèle ne calcule ni paie ni
indicateur depuis des lignes récupérées lorsqu’un service de référence existe.

## Gouvernance avant ingestion

Chaque corpus possède un responsable, un public autorisé, une finalité, une classification,
des sources autorisées, une politique de version/expiration, une rétention et un mode de retrait.
Le propriétaire choisit le premier corpus ; ce plan ne publie pas tout `docs/` à tous les utilisateurs.

Recommandation de pilote : aide métier relue et publiée sur les parcours existants. Les secrets,
exports, données RH nominatives, fichiers d’environnement, prompts système, skills d’agents,
brouillons et documents contractuels non autorisés sont exclus. Les fichiers réglementaires ou
juridiques demandent provenance officielle, juridiction et date d’effet ; une réponse ne se
présente pas comme un avis juridique ni comme une règle de paie nouvelle.

## Chaîne d’ingestion proposée

1. **Admettre** une source explicitement autorisée : identifiant stable, hash, version, propriétaire,
   ACL, classification, langue, dates de publication/effet et lien d’origine.
2. **Contrôler** type MIME réel, taille, archives, contenu actif et destinations réseau. Extraction
   en environnement borné ; OCR uniquement si le texte manque. Conserver la page et signaler
   l’incertitude d’extraction. Quarantainer un document invalide ou suspect.
3. **Normaliser et découper** en respectant titres, paragraphes, tableaux et pages. Choisir taille,
   recouvrement et traitement multilingue à partir des questions de référence ; ne pas inventer
   une taille universelle. Garder offsets et empreinte du passage.
4. **Indexer** une génération : texte plein texte, métadonnées et embeddings versionnés. La clé
   source/version/hash/configuration permet une reprise idempotente et détecte les changements.
5. **Valider et publier** atomiquement le manifeste de génération lorsque la source entière est
   prête. Les résultats d’un job partiel ne deviennent pas un corpus actif.
6. **Surveiller** retards, erreurs, volume, coût, sources expirées et divergences de versions.
   Retrait ou changement de droits bloque la recherche immédiatement, avant reconstruction.

Spring reste propriétaire du corpus et de sa recherche autorisée. Un worker TypeScript candidat
orchestre extraction/embeddings via la passerelle. Il lit les lots et remet les résultats par des
capacités d’indexation contrôlées, avec identité technique séparée du catalogue utilisateur ;
aucun accès direct Node aux tables métier ou corpus. Ce contrat et ses permissions doivent être
validés avant réalisation. Il n’autorise pas l’exécution de SQL fourni par le modèle.

## Modèle logique à valider, sans migration dans ce lot

| Concept | Données nécessaires |
|---|---|
| Source | Identité, propriétaire, classification, lien, version/hash, dates, état publié/retiré |
| Document/génération | Source et version, extraction, langue, génération active, résultats de contrôle |
| Passage | Document/génération, texte, page/section/offsets, hash, index lexical, référence embedding |
| Embedding | Passage, modèle/version/dimension/distance, version du découpage et date de calcul |
| Droits | Sujet/groupe/périmètre autorisé, version de politique ; droits provenant du serveur |
| Job d’ingestion | Étape, curseur durable, tentatives bornées, erreur catégorisée, corrélation |

Les noms de tables, contraintes, index et permissions seront fixés au lot P4.3, par migrations
Flyway nouvelles. Pas de numéro de migration réservé à l’avance et aucune migration appliquée
modifiée. L’index est dérivé et reconstructible ; les sources et manifestes faisant autorité
sont conservés selon leur politique. Les objectifs de reconstruction et sauvegarde sont à décider.

## Recherche et génération

La référence initiale est une recherche déterministe sans LLM : mots exacts, code métier et
plein texte. Comparer ensuite lexical + vecteurs, fusion de rangs (RRF candidate) et éventuellement
reranking. Garder le pipeline le plus simple qui réussit le jeu de questions. Un reranker ou
un modèle d’embedding est lui aussi soumis à la classification et au budget.

Le serveur établit l’utilisateur et ses droits, restreint le corpus et applique les filtres dans
la recherche avant tout retour au runtime. Aucun filtre d’ACL n’est choisi par le modèle. Le
runtime ne reçoit que les passages nécessaires, avec identifiant source/version, emplacement,
provenance et date. Les liens sont contrôlés et la lecture directe est réautorisée.

[pgvector](https://github.com/pgvector/pgvector) permet recherche exacte, index ANN et recherche
hybride. Après filtrage, un index approximatif peut fournir trop peu de candidats : tester
qualité et latence avec les ACL réelles, comparer recherche exacte, index métadonnées et scans
itératifs bornés avant d’ajouter partitionnement ou index complexes.

La [RLS PostgreSQL](https://www.postgresql.org/docs/18/ddl-rowsecurity.html) est une défense
supplémentaire candidate. Elle ne remplace pas le RBAC ni la politique de champs ; un propriétaire
de table ou un rôle `BYPASSRLS` peut changer la garantie. Tester le compte runtime réel et la
réinitialisation du contexte sur chaque connexion mutualisée, y compris après erreur/rollback.

Le modèle reçoit les sources comme données non fiables, jamais comme instructions. Une phrase
dans un PDF ne peut pas changer le système, l’identité, les outils ou la politique de confirmation.
Les réponses citent des passages effectivement retournés, et le serveur valide leur existence et
leur version. Une citation valide n’est pas une preuve que le texte généré en découle : évaluer
aussi l’ancrage de chaque affirmation importante et les conflits entre sources.

En cas de source absente, contradictoire, périmée ou hors périmètre, répondre avec la limite ou
demander une précision. Ne pas compléter une règle RH inconnue par une supposition. Afficher la
date d’effet lorsque pertinente et renvoyer au parcours métier pour une action.

## Révocation, mémoire et suppression

Retirer une source ou un droit invalide aussi caches de recherche, citations réutilisables et
contexte futur. Avant reprise d’un thread, revalider ses références ; purger/reconstruire les
passages et résumés contaminés ou refuser la reprise tant que ce n’est pas sûr. Ne pas envoyer
à nouveau au modèle une ancienne copie devenue interdite. Un résumé peut contenir la même
information sensible que le document d’origine.

La suppression couvre sources selon politique, passages, vecteurs, mémoire longue, caches et
copies dans les checkpoints. Les sauvegardes suivent une durée et une procédure documentées ;
restaurer exige de réappliquer les retraits avant remise en service. Ne pas promettre d’effacer
ce qu’un utilisateur avait déjà vu ou exporté légitimement.

Le contexte court reste borné en tokens. Les résumés glissants conservent provenance et limites,
mais les autorisations et approbations résident dans des structures serveur distinctes et sont
revérifiées. La mémoire longue ne contient que des préférences/connaissances explicitement
admises, sourcées, consultables et supprimables ; une déduction sur un employé n’y est pas promue.

## Évaluation avant activation

| Famille | Cas représentatifs | Preuve |
|---|---|---|
| Retrieval | Exact, paraphrase, code métier, faute de frappe, langues présentes, tableau/PDF, question multi-document | Recall@k/MRR ou métrique choisie, comparaison aux passages annotés ; valeurs cibles à approuver |
| Réponse | Réponse sourcée, ambiguë, absente, conflit, document expiré | Citations exactes et accessibles, ancrage, abstention et revue humaine |
| Autorisation | Deux utilisateurs, refus individuel, changement d’ACL, source retirée, connexion DB réutilisée | Zéro divulgation interdite ; tests déterministes bloquants |
| Injection | Instruction malveillante dans document, métadonnée, OCR ou résultat d’outil | Aucun changement de droit, outil ou instruction système |
| Cycle de vie | Double ingestion, interruption, suppression, changement d’embedding, reconstruction et restauration | Génération cohérente, pas de doublon actif ni passage retiré réexposé |
| Exploitation | Volume, filtrage sélectif, fournisseur indisponible, budget atteint et client lent | p50/p95, tokens/coût, fraîcheur et comportement dégradé documentés |

Jeux, annotations, prompts, outils, modèle servi, paramètres et rapports sont versionnés sans
données réelles. Les tests déterministes sont séparés des notes de qualité probabilistes ;
un juge LLM ne valide ni permission ni montant ni règle métier.
