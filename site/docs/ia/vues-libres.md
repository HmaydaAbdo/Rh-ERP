---
title: Vues libres (interface générative ouverte)
sidebar_position: 12
---

# Vues libres

Livraison du prototype de KAN-95 (épopée E12), décision Q7 du 2026-10-31, périmètre fixé par le propriétaire le 2026-11-16 : **zéro porte** vers l'application, **liste blanche de CDN**, **activé pour tous** (décision du propriétaire du 2026-11-16 : M1 à M4 partout, obligatoire).

## Ce que c'est

Quand les briques du catalogue ne suffisent pas, l'agent peut écrire une petite page (HTML, CSS, JavaScript) qui s'affiche dans la conversation, par l'outil officiel `generateSandboxedUi` de CopilotKit. La page vit dans une iframe isolée : elle ne voit ni la session, ni les cookies, ni le reste de l'application.

## Garde-fous

| Garde-fou | Mise en œuvre | Preuve |
|---|---|---|
| Interrupteur | `VUES_LIBRES` (défaut `true`) : le runtime applique le middleware officiel sauf si la valeur est `false` ; éteint, le navigateur ne reçoit pas l'annonce (`/info`) et n'enregistre ni l'outil ni le rendu : l'agent ne le voit pas | Test du runtime : aucune vue interrupteur éteint, une vue interrupteur allumé |
| Zéro porte | Aucune `sandboxFunctions` déclarée, et le chargeur du moteur (`vues-libres.ts`) donne une interface vide à l'iframe quoi que la configuration contienne : la vue ne peut rien demander à l'application | Test unitaire (interface vide) |
| Aucun réseau | Politique de contenu posée avant le code généré : `default-src 'none'`, `connect-src 'none'`, pas d'image ni de police externe, pas de formulaire, pas de cadre ; le code généré ne peut ni la retirer ni l'assouplir | Test dans Chromium : `fetch` vers l'extérieur, image externe, script externe bloqués, `localStorage` et `parent.document` inaccessibles |
| Bibliothèques | Seulement Chart.js 4.4.7 et D3 7.9.0 depuis `cdn.jsdelivr.net`, adresse et version exactes | Même test : la bibliothèque admise ne produit aucune violation, un autre script en produit une |
| Chiffres | Une valeur affichée vient d'un outil métier ; la consigne de l'agent interdit de calculer ou d'inventer | Règle du prompt ; jeu adverse requis avant ouverture |

## Garde-fous restant à livrer (M4 est déjà actif)

Le propriétaire a rendu M4 obligatoire pour tous le 2026-11-16 ; les garde-fous ci-dessous ne sont donc plus des conditions d'ouverture mais des **travaux ouverts**. Reste à faire, conformément à `conventions/agent-ui.md` : l'interrupteur d'arrêt à chaud sans redéploiement (E5.5), le jeu adverse rejoué à chaque changement de modèle (injection par un champ piégé, fausse interface, usurpation de bouton d'approbation, E6.5), les bornes de taille, de durée et de fréquence, et l'audit de chaque ouverture. Tant que ce n'est pas fait, M4 tourne avec le seul interrupteur de redéploiement (`VUES_LIBRES=false`) ; en production. Une page peut encore tromper visuellement (fausse fenêtre d'approbation) : la politique de contenu empêche la fuite, pas l'usurpation.

## Limites connues

- La politique est posée par une balise dans le document de l'iframe : elle couvre le code de la vue, pas le moteur de la bibliothèque (le script en ligne du moteur est autorisé).
- Une bibliothèque autorisée doit être revalidée à chaque changement de version (adresse et version exactes dans `vues-libres.ts`).
- Aucune fonction de l'hôte : une future porte (relecture d'une donnée) demandera sa propre décision, droits revérifiés côté serveur et appel journalisé.
