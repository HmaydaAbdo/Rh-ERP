---
title: Cadrage de la gestion documentaire (E14.A1)
sidebar_position: 15
---

# Cadrage de la gestion documentaire (E14.A1, KAN-289)

Phase P0 de l'[étude](etude-gestion-documentaire.md) : ce qui est traité, avec quels documents, pour quels cas d'usage, et comment on juge la réussite. Tous les bancs d'essai (KAN-290 à KAN-297) s'appuient sur cette page.

## Décision du propriétaire (2026-11-23)

Le corpus de départ est composé de **textes publics seulement**. Aucun document interne de Staport (bulletins, contrats, procédures, pièces du personnel) n'entre dans les bancs d'essai. Conséquences :

- aucune donnée soumise à la CNDP ne sort ni n'est indexée pendant l'étude ;
- les services cloud ne sont mesurés que sur ces textes publics, comme référence de qualité ;
- les documents internes seront traités plus tard, par la chaîne retenue, sur décision explicite du propriétaire (question 7 de l'étude, **tranchée pour la phase d'étude : aucun**).

## Corpus de l'étude

| Famille | Contenu | Langue | Nature | Usage |
|---|---|---|---|---|
| Droit du travail | Code du travail marocain (loi 65-99) | français, arabe | PDF texte, articles numérotés | B : lecture ciblée par article |
| Protection sociale | Textes et guides CNSS, AMO | français, arabe | PDF texte et tableaux | B : barèmes, plafonds, taux |
| Fiscalité de la paie | Barème de l'IR, notes de la DGI | français | PDF texte et tableaux | B |
| Scans de référence | Pages publiques imprimées puis numérisées, ou dégradées artificiellement | français, arabe | images | Banc d'essai des parseurs (OCR) |
| Documents types | Modèles publics de contrat, de bulletin, de certificat | français | PDF, Word | C : extraction structurée |

Volume visé : de 10 à 30 documents, quelques milliers de pages au plus. Cet ordre de grandeur reste très en dessous du seuil où un moteur dédié se justifie (KAN-292 le confirme ou l'infirme).

## Cas d'usage

**B. Base de connaissances (assistant réglementaire).** Exemples : « Quel est le préavis de licenciement pour un salarié de plus de 5 ans d'ancienneté ? », « Quel est le plafond de cotisation CNSS ? ». Exigences : réponse juste, **citation de l'article et de la page**, refus de répondre quand le corpus ne contient pas la réponse.

**C. Extraction structurée.** Exemples : contrat modèle → parties, dates, montants ; bulletin modèle → lignes de paie. Exigence : exactitude champ par champ, validation humaine avant toute écriture dans l'ERP.

## Métriques de réussite

| Cas | Métrique | Seuil de départ |
|---|---|---|
| Lecture (A2) | Fidélité du texte et des tableaux, mesurée sur des pages étiquetées à la main | À fixer après le premier passage |
| Récupération (A3, A4, A5, A6) | Rappel@5 et précision@5 : la page source attendue figure-t-elle parmi les 5 premiers résultats ? | Rappel@5 d'au moins 90 % sur le français |
| Réponse (B) | Réponse juste ET citation correcte ; part de refus justifiés sur les questions hors corpus | Aucune citation inventée tolérée |
| Extraction (C) | Exactitude par champ | 100 % sur les champs financiers, ou revue humaine obligatoire |

Latence, poids et coût sont **hors périmètre** de l'étude (décision du 2026-11-22 pour les revues de domaine, reprise ici).

## Jeu de référence

- **Taille.** 200 à 300 questions, réparties entre français, arabe et mélange des deux ; au moins 15 % de questions **sans réponse dans le corpus**.
- **Étiquettes.** Pour chaque question : document source, page, article, réponse attendue en une phrase, type (fait, tableau, comparaison, multi-articles), langue.
- **Règle d'établissement.** Les étiquettes sont écrites à partir du texte du document, jamais générées puis acceptées sans relecture ; un échantillon est relu par le propriétaire.
- **Format.** Un fichier JSON Lines versionné dans le dépôt, à côté des tests de l'agent (E20), avec la liste des documents sources et leur empreinte.
- **État (2026-11-24).** Jeu constitué : [`ia/evaluation/rag_questions.jsonl`](../../../ia/evaluation/rag_questions.jsonl) (338 questions) et `ia/evaluation/rag_sources.json` (sept documents, SHA-256, statistiques). Répartition : 294 en français, 44 en arabe (dont des questions arabes sur des textes français) ; 287 avec réponse (215 faits, 29 tableaux, 20 calculs, 6 listes, 10 multi-sources, 7 comparaisons) et 51 sans réponse (15,1 %). **Chaque citation est retrouvée dans le texte de la page indiquée** (0 non trouvée), y compris les sources supplémentaires des questions multi-sources (champ `sources_supplementaires`) ; l'arabe vient de la couche texte lue par Docling, comparée sans espaces (espaces parasites dans les mots). Les pièges de version sont posés (Code du travail FR 2011 contre AR 2026, circulaires 733 de 2023 et 737 de 2026). **Écarts connus** : comparaisons et multi-sources portent sur les notes DGI, le CGI, la loi 65-00 et le décret CNSS, pas sur le Code du travail FR contre AR ; aucune question en mélange français-arabe dans une même phrase ; les questions sans réponse n'ont pas de citation par construction ; **échantillon à relire par le propriétaire**.

## Documents rapatriés (2026-11-23, accord du propriétaire)

Dossier local hors dépôt : `Desktop\Badia\corpus-rag-public`. Seules les références ci-dessous sont versionnées.

| Fichier | Source | Taille | SHA-256 |
|---|---|---|---|
| `code-travail-fr-adala-consolide.pdf` | Ministère de la Justice, adala.justice.gov.ma, Code du travail en français (version consolidée du 26 octobre 2011, antérieure aux lois de 2016, 2021 et 2026) | 1 515 526 o | `91c67dd23c5a2d9aa01c997542ed547b4077135c2528baf74e2a385ea5dfc8f3` |
| `code-travail-ar-adala-2026.pdf` | adala.justice.gov.ma, مدونة الشغل (dahir 1.03.194, loi 65.99), arabe, version annoncée comme mise à jour en juillet 2026 | 2 643 620 o | `dda82c7bb74f36cc2754ebb56ee218fa7a92b21bb99e902a29e5f9e57144d8ba` |
| `note-circulaire-733-lf2023.pdf` | Note circulaire DGI n° 733 (loi de finances 2023), copie hébergée par ecoactu.ma | 1 620 763 o | `c6946daa9b360accc1cb7fe1a3d3d695bb197e5189b305748d36bf74dbd2ad34` |

Ajoutés ensuite le même jour, téléchargés depuis les sites officiels (cnss.ma, tax.gov.ma) avec un navigateur piloté :

| Fichier | Source | Taille | SHA-256 |
|---|---|---|---|
| `cnss-recueil-textes-regime-general-2026-01.pdf` | cnss.ma, Réglementation : recueil des textes juridiques du régime général (7 janvier 2026) | 3 710 396 o | `d538562b1b8c134f9f5eb36d391c24433823628c3be67aa86b4e94989fa80132` |
| `loi-65-00-amo-cnss.pdf` | cnss.ma, Réglementation : loi 65-00 (AMO) | 419 776 o | `5ca5b27eda1708d8533c65ca988c0ce40673782f7d9ec79d74583a99bb82ecaf` |
| `dgi-note-circulaire-737-lf2026.pdf` | tax.gov.ma : note circulaire n° 737, mesures fiscales de la loi de finances 2026 | 1 273 627 o | `678db3a9ba73d85027cffe888c1b714783bd11459a9d7a7385bf027ce0434d22` |
| `dgi-cgi-2026-fr.pdf` | tax.gov.ma : Code général des impôts 2026 (français) | 6 450 849 o | `28f85c69b2601f98c968895bc904c0978af39a946e60699311040823a3b03022` |

Le recueil CNSS ne donne que 2 600 caractères de texte sur ses 5 premières pages : une partie est probablement en images, à traiter par OCR (KAN-290). Le guide employeur CNSS avec taux et plafonds n'existe pas en PDF officiel : les taux se trouvent dans le recueil et dans le communiqué sur l'assiette de cotisations (1er octobre 2025), publié en page web sur cnss.ma.

**Constats de départ (extraction de texte brute, `pdftotext`) :**

- Les PDF français ont une couche de texte exploitable.
- Le PDF arabe produit un texte **illisible** : la couche de texte est mal encodée. Il faudra un OCR ou la lecture par Docling pour l'exploiter ; c'est un cas d'essai direct pour KAN-290.
- Le texte français est antérieur aux lois de 2016, 2021 et 2026 : pour les articles modifiés, l'arabe fait foi. Le jeu de référence ne pose donc **aucune question sur un article modifié depuis 2011** tant que cette différence n'est pas tracée.

**Non trouvés ou non retenus :**

- Le guide employeur officiel de la CNSS et la circulaire DGI n° 737 (loi de finances 2026) n'ont pas été trouvés en PDF officiel : seuls des sites tiers les citent, avec des chiffres qui divergent (par exemple le taux employeur). Ils restent à obtenir auprès de cnss.ma et de la DGI avant d'écrire des questions sur les cotisations ou le barème de l'IR en vigueur.
- Les copies de l'OIT ont renvoyé une page d'erreur et n'ont pas été conservées.

## Ce qui reste à faire pour clore E14.A1

1. (Fait pour le recueil CNSS, la loi 65-00 et la circulaire 737.) Le communiqué CNSS sur l'assiette reste à capturer.
2. Faire relire un échantillon des questions par le propriétaire ; compléter comparaisons et multi-articles (citations à plusieurs pages).
3. Fixer les seuils des métriques de lecture après un premier passage.
4. Consigner le tout dans Jira (KAN-289) ; les bancs d'essai peuvent alors démarrer.
