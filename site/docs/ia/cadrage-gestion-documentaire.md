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
- **État.** Le gabarit est fixé ici ; **le jeu lui-même n'est pas encore constitué** : trois documents sont rapatriés (voir plus bas), les textes CNSS, AMO et IR officiels manquent encore.

## Documents rapatriés (2026-11-23, accord du propriétaire)

Dossier local hors dépôt : `Desktop\Badia\corpus-rag-public`. Seules les références ci-dessous sont versionnées.

| Fichier | Source | Taille | SHA-256 |
|---|---|---|---|
| `code-travail-fr-adala-consolide.pdf` | Ministère de la Justice, adala.justice.gov.ma, Code du travail en français (version consolidée du 26 octobre 2011, antérieure aux lois de 2016, 2021 et 2026) | 1 515 526 o | `91c67dd23c5a2d9aa01c997542ed547b4077135c2528baf74e2a385ea5dfc8f3` |
| `code-travail-ar-adala-2026.pdf` | adala.justice.gov.ma, مدونة الشغل (dahir 1.03.194, loi 65.99), arabe, version annoncée comme mise à jour en juillet 2026 | 2 643 620 o | `dda82c7bb74f36cc2754ebb56ee218fa7a92b21bb99e902a29e5f9e57144d8ba` |
| `note-circulaire-733-lf2023.pdf` | Note circulaire DGI n° 733 (loi de finances 2023), copie hébergée par ecoactu.ma | 1 620 763 o | `c6946daa9b360accc1cb7fe1a3d3d695bb197e5189b305748d36bf74dbd2ad34` |

**Constats de départ (extraction de texte brute, `pdftotext`) :**

- Les PDF français ont une couche de texte exploitable.
- Le PDF arabe produit un texte **illisible** : la couche de texte est mal encodée. Il faudra un OCR ou la lecture par Docling pour l'exploiter ; c'est un cas d'essai direct pour KAN-290.
- Le texte français est antérieur aux lois de 2016, 2021 et 2026 : pour les articles modifiés, l'arabe fait foi. Le jeu de référence ne pose donc **aucune question sur un article modifié depuis 2011** tant que cette différence n'est pas tracée.

**Non trouvés ou non retenus :**

- Le guide employeur officiel de la CNSS et la circulaire DGI n° 737 (loi de finances 2026) n'ont pas été trouvés en PDF officiel : seuls des sites tiers les citent, avec des chiffres qui divergent (par exemple le taux employeur). Ils restent à obtenir auprès de cnss.ma et de la DGI avant d'écrire des questions sur les cotisations ou le barème de l'IR en vigueur.
- Les copies de l'OIT ont renvoyé une page d'erreur et n'ont pas été conservées.

## Ce qui reste à faire pour clore E14.A1

1. Obtenir les textes officiels de la CNSS, de l'AMO et du barème de l'IR en vigueur (voir ci-dessus).
2. Écrire les 200 à 300 questions étiquetées et en faire relire un échantillon.
3. Fixer les seuils des métriques de lecture après un premier passage.
4. Consigner le tout dans Jira (KAN-289) ; les bancs d'essai peuvent alors démarrer.
