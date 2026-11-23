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
- **État.** Le gabarit est fixé ici ; **le jeu lui-même n'est pas encore constitué** : il demande de rapatrier les documents publics, ce qui attend l'accord du propriétaire (téléchargement de fichiers).

## Ce qui reste à faire pour clore E14.A1

1. Rapatrier les documents publics du tableau, dans un dossier local hors dépôt (seuls la liste, les adresses et les empreintes sont versionnées).
2. Écrire les 200 à 300 questions étiquetées et en faire relire un échantillon.
3. Fixer les seuils des métriques de lecture après un premier passage.
4. Consigner le tout dans Jira (KAN-289) ; les bancs d'essai peuvent alors démarrer.
