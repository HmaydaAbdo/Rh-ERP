---
title: Vues libres (interface générative ouverte)
sidebar_position: 12
---

# Vues libres

Livraison du prototype de KAN-95 (épopée E12), décision Q7 du 2026-10-31, périmètre fixé par le propriétaire le 2026-11-16 : **zéro porte** vers l'application, **liste blanche de CDN**, **activé pour tous** (décision du propriétaire du 2026-11-16 : M1 à M4 partout, obligatoire). Depuis le 2026-11-16 (même jour), **toujours actives, sans interrupteur ni plafond** (taille, durée, nombre par réponse, fréquence) : il ne reste que l'isolation, la politique de contenu et l'audit.

## Ce que c'est

Quand les briques du catalogue ne suffisent pas, l'agent peut écrire une petite page (HTML, CSS, JavaScript) qui s'affiche dans la conversation, par l'outil officiel `generateSandboxedUi` de CopilotKit. La page vit dans une iframe isolée : elle ne voit ni la session, ni les cookies, ni le reste de l'application.

## Garde-fous

| Garde-fou | Mise en œuvre | Preuve |
|---|---|---|
| Zéro porte | Aucune `sandboxFunctions` déclarée, et le chargeur du moteur (`vues-libres.ts`) donne une interface vide à l'iframe quoi que la configuration contienne : la vue ne peut rien demander à l'application | Test unitaire (interface vide) |
| Aucun réseau | Politique de contenu posée avant le code généré : `default-src 'none'`, `connect-src 'none'`, pas d'image ni de police externe, pas de formulaire, pas de cadre ; le code généré ne peut ni la retirer ni l'assouplir | Test dans Chromium : `fetch` vers l'extérieur, image externe, script externe bloqués, `localStorage` et `parent.document` inaccessibles |
| Bibliothèques | Seulement Chart.js 4.4.7 et D3 7.9.0 depuis `cdn.jsdelivr.net`, adresse et version exactes | Même test : la bibliothèque admise ne produit aucune violation, un autre script en produit une |
| Chiffres | Une valeur affichée vient d'un outil métier ; la consigne de l'agent interdit de calculer ou d'inventer | Règle du prompt ; jeu adverse requis avant ouverture |

## Audit et jeu adverse (KAN-283, KAN-284)

Le propriétaire a décidé le 2026-11-16 que les vues libres sont **toujours actives** et **sans plafond** : les paramètres de l'écran Paramètres (interrupteur d'arrêt à chaud, taille maximale, durée maximale, vues par réponse, vues par minute), livrés par KAN-281 et KAN-282, sont retirés (révision de base `0008_retrait_vues_libres`, route `GET /parametres/vues-libres` supprimée, chargeur du navigateur sans minuteur, runtime sans compteur). Aucune vue n'est refusée pour sa taille, sa durée ou sa fréquence ; ce qui protège l'application est l'isolation de l'iframe et sa politique de contenu, le jeu adverse et l'audit.

| Garde-fou | Mise en œuvre | Preuve |
|---|---|---|
| Audit (KAN-283) | Chaque vue admise est inscrite au journal (`VUE_LIBRE_OUVERTURE` : fil et taille, jamais le contenu) AVANT d'être montrée ; si l'inscription échoue, la vue n'est pas montrée | Tests du runtime et de l'API |
| Jeu adverse (KAN-284) | 19 tentatives hostiles rejouées dans Chromium à chaque exécution de la CI (`frontend/e2e/vues-libres.spec.ts` : exfiltration par réseau, redirection, navigation du cadre, fenêtre, WebSocket, `eval`, cookies, parent, etc.), jugées par un point d'interception réseau : aucune requête ne doit sortir. Six cas de sécurité visant les vues libres sont ajoutés au banc de l'agent (`ia/evaluation/jeu_reference.json`, version 3) et sont rejoués à chaque exécution du banc, donc à chaque changement de modèle ou de prompt | Tests Playwright, banc |

**Faille trouvée par le jeu adverse et fermée.** La politique de contenu de l'iframe ne couvre pas la navigation du cadre lui-même : un `<meta http-equiv="refresh">` ou un `location.href` portant les données dans l'adresse sortait de l'application. Le document hôte porte maintenant `Content-Security-Policy: frame-src 'self'` (`frontend/nginx.conf`), qui s'applique à chaque navigation de ses cadres ; le cadre d'une vue est `about:srcdoc`, que la règle laisse passer. Le test lit la politique dans `nginx.conf` pour suivre le serveur.

## Limites connues

- La politique est posée par une balise dans le document de l'iframe : elle couvre le code de la vue, pas le moteur de la bibliothèque (le script en ligne du moteur est autorisé).
- Une bibliothèque autorisée doit être revalidée à chaque changement de version (adresse et version exactes dans `vues-libres.ts`).
- Aucune fonction de l'hôte : une future porte (relecture d'une donnée) demandera sa propre décision, droits revérifiés côté serveur et appel journalisé.
- Le jeu adverse du banc de l'agent vérifie que l'agent refuse ou signale la limite ; il ne prouve pas qu'aucune vue dangereuse ne soit jamais produite : c'est le rôle de l'isolation (iframe, politique de contenu, `frame-src`), testée dans Chromium, qui ne dépend pas du modèle.
- Sans plafond de taille, de durée ni de fréquence : une vue qui boucle sans fin occupe son iframe jusqu'à ce que l'utilisateur la ferme ou quitte la page, et un agent qui en ouvre beaucoup n'est pas freiné par l'application (le quota des modèles et la limite de débit du proxy restent les seuls freins). Décision du propriétaire du 2026-11-16 ; à rouvrir si un abus est mesuré.
