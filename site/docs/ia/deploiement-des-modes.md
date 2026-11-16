---
title: Déploiement des modes par domaine
sidebar_position: 13
---

# Déploiement des modes de l'assistant par domaine

Cadrage de KAN-101 (épopée E12), choix du propriétaire du 2026-11-16 : **constater l'état réel, fixer la porte de revue, ouvrir une sous-tâche de revue par domaine**. Aucun code nouveau : l'assistant offre déjà les modes ci-dessous à toute personne ayant le droit IA et le droit du domaine.

## Les modes

| Mode | Ce que l'utilisateur obtient | Mécanisme réel |
|---|---|---|
| M0 | L'écran classique, sans assistant | Les pages de l'application, inchangées |
| M1 | Le chat : question, réponse citée | Agent + outils MCP en lecture, filtrés par droit |
| M2 | Cartes et tableaux prévus à l'avance, filtres réglés sur la page | Rendu des appels d'outils (carte par outil, `registerRenderToolCall`) et outils de page (`registerFrontendTool`) |
| M3 | Une vue composée avec les briques Staport | Catalogue A2UI fermé : grille d'indicateurs, graphique, tableau, frise |
| M4 | Une vue libre écrite par l'agent | Iframe isolée, zéro porte, aucun réseau ; **toujours active, pour tous, sans interrupteur ni plafond** (décision du 2026-11-16, voir [Vues libres](vues-libres.md)) |

**Règle du propriétaire (2026-11-16) : M1 à M4 sont ouverts pour tous les domaines, obligatoirement.** Les modes coexistent : chaque parcours garde son écran classique (M0). Aucun mode n'accorde un droit : chaque outil revérifie identité, permission et périmètre côté serveur, et **tout est en lecture** (les écritures passent par l'accord humain, voir [Sécurité et expérience](securite-et-experience.md)).

## État réel au 2026-11-16

`✔` = livré et ouvert à qui a le droit ; `—` = non applicable. Le droit IA (`IA_UTILISER`) est requis partout.

| Domaine | Droit de lecture des outils | M1 chat (outils MCP) | M2 cartes d'outils | M2 outil de page (filtres) | M3 vue A2UI proposée | M4 vue libre |
|---|---|---|---|---|---|---|
| Chantier | `CHANTIER_READ` | ✔ rechercher, fiche | ✔ | ✔ page Chantiers | fiche | ✔ |
| Employé | `EMPLOYEE_READ` (salaire : `PAIE_READ`) | ✔ rechercher, fiche, compter, regrouper, sorties, parcours | ✔ | ✔ page Employés | fiche, cartes, analytique | ✔ |
| Paie | `PAIE_READ` | ✔ indicateurs, périodes, répartition, évolution, comparer, mouvements, qualité, bulletins | ✔ | ✔ page Paie | analytique, cartes, tabulaire | ✔ |
| Équipe | `EQUIPE_READ` | ✔ rechercher, fiche | ✔ | ✔ page Équipes | tabulaire, fiche | ✔ |
| Fonction | `FUNCTION_READ` | ✔ rechercher, fiche | ✔ | ✔ page Fonctions | tabulaire, fiche | ✔ |
| Heures supplémentaires | `HEURES_SUP_READ` + `PAIE_READ` | ✔ périodes, prérequis d'import, indicateurs, rechercher | ✔ | ✔ page Heures supp. | analytique | ✔ |
| Rapport et export | `PAIE_EXPORT` + `PAIE_READ` | ✔ préparer (aucun fichier généré) | ✔ (carte d'export) | — | tabulaire | ✔ |
| Accueil | `ACCUEIL_READ` | ✔ indicateurs de l'utilisateur | ✔ | — | — | ✔ |
| Administration (paramètres, rôles, audit) | `PARAMETRE_READ`, `ROLE_MANAGE`, `AUDIT_READ` | ✔ lecture seule | ✔ | — | — | ✔ |

Le catalogue exact des outils, leurs arguments et leurs vues proposées sont dans [État technique et catalogue MCP](etat-technique-et-catalogue-mcp.md).

**Ce qui n'existe pas.** Il n'y a pas d'interrupteur propre à un domaine : un mode s'ouvre pour tous les domaines à la fois, filtré seulement par les droits. Le propriétaire a choisi (2026-11-16) de ne pas en ajouter pour l'instant ; la revue par domaine ci-dessous suffit à décider s'il en faut un.

## Porte d'activation : six preuves par domaine et par mode

Un domaine est « validé » dans un mode quand les six preuves sont consignées dans la sous-tâche Jira de ce domaine.

| Preuve | À présenter |
|---|---|
| Utilité | La même tâche faite en M0 et dans le mode : résultat exact, effort observé, avis d'un utilisateur du domaine |
| Droits et exactitude | Essais négatifs (utilisateur sans le droit, champs interdits, périmètre), chiffres identiques à ceux de l'écran classique, sources citées ou abstention |
| Continuité | Retour à M0 avec les filtres conservés, question ambiguë clarifiée, droits retirés en cours de route, run interrompu puis repris |
| Interface | Navigateur réel : clavier et focus, lecteur d'écran, téléphone, thèmes, états vide, erreur et refus, repli texte (suite de KAN-99) |
| Robustesse et coût | Composant, schéma ou outil inconnu refusé, limites testées, latence, poids et coût mesurés |
| Revue | Rapport, captures, page de documentation du domaine, accord du propriétaire daté avant d'élargir |

Les seuils (utilité, latence, coût) sont fixés par le propriétaire du domaine ; le développement n'en invente aucun.

## Suivi

Une sous-tâche Jira par domaine, sous KAN-101, porte ces preuves. M4 (vues libres) est inclus dans chaque revue de domaine ; ses garde-fous (isolation, politique de contenu, audit, jeu adverse) sont décrits dans [Vues libres](vues-libres.md).
