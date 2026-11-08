---
title: Glossaire
sidebar_position: 8
---

Termes métier et techniques du produit.

| Terme | Signification |
|---|---|
| **Staport** | L'entreprise de BTP (bâtiment et travaux publics) qui utilise l'application |
| **CIN** | Carte d'identité nationale, clé métier d'un employé |
| **Chantier** | Site de travaux, identifié par un code (ex. `C168`) |
| **Équipe** | Groupe de travail (chauffeurs, opérateurs, atelier…), identifié par un code (ex. `CH`) |
| **Bulletin / paie** | Ligne de paie mensuelle d'un employé (un par employé et par mois) |
| **Période** | Mois de paie, au format `aaaa-MM` dans l'API et `aaaaMM` en base |
| **Snapshot** | Valeur figée au mois du bulletin (fonction, chantier, équipe), qui ne suit pas les changements ultérieurs de l'employé |
| **STC** | Solde de tout compte : employés sortis, suivis à part dans le rapport |
| **J.R.O / J.R.D** | Jours de récupération (jour ouvrable / dimanche) |
| **Prime RO / RD** | Prime de roulage (ordinaire / dimanche) |
| **ERP** | Système de gestion existant de Staport, source des chantiers |
| **Façade de service** | Interface qu'un domaine expose aux autres : un domaine n'utilise jamais le dépôt de données d'un autre |
| **Permission** | Code d'action (ex. `PAIE_WRITE`), attribué via des rôles ; un refus individuel l'emporte sur les rôles |
