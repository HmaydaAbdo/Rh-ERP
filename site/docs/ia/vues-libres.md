---
title: Vues libres (interface générative ouverte)
sidebar_position: 12
---

# Vues libres

Livraison du prototype de KAN-95 (épopée E12), décision Q7 du 2026-10-31, périmètre fixé par le propriétaire le 2026-11-16 : **zéro porte** vers l'application, **liste blanche de CDN**, **activé pour tous** (décision du propriétaire du 2026-11-16 : M1 à M4 partout, obligatoire), avec arrêt à chaud, bornes et audit.

## Ce que c'est

Quand les briques du catalogue ne suffisent pas, l'agent peut écrire une petite page (HTML, CSS, JavaScript) qui s'affiche dans la conversation, par l'outil officiel `generateSandboxedUi` de CopilotKit. La page vit dans une iframe isolée : elle ne voit ni la session, ni les cookies, ni le reste de l'application.

## Garde-fous

| Garde-fou | Mise en œuvre | Preuve |
|---|---|---|
| Interrupteur de déploiement | `VUES_LIBRES` (défaut `true`) : le runtime applique le middleware officiel sauf si la valeur est `false` ; éteint, le navigateur ne reçoit pas l'annonce (`/info`) et n'enregistre ni l'outil ni le rendu : l'agent ne le voit pas | Test du runtime : aucune vue interrupteur éteint, une vue interrupteur allumé |
| Zéro porte | Aucune `sandboxFunctions` déclarée, et le chargeur du moteur (`vues-libres.ts`) donne une interface vide à l'iframe quoi que la configuration contienne : la vue ne peut rien demander à l'application | Test unitaire (interface vide) |
| Aucun réseau | Politique de contenu posée avant le code généré : `default-src 'none'`, `connect-src 'none'`, pas d'image ni de police externe, pas de formulaire, pas de cadre ; le code généré ne peut ni la retirer ni l'assouplir | Test dans Chromium : `fetch` vers l'extérieur, image externe, script externe bloqués, `localStorage` et `parent.document` inaccessibles |
| Bibliothèques | Seulement Chart.js 4.4.7 et D3 7.9.0 depuis `cdn.jsdelivr.net`, adresse et version exactes | Même test : la bibliothèque admise ne produit aucune violation, un autre script en produit une |
| Chiffres | Une valeur affichée vient d'un outil métier ; la consigne de l'agent interdit de calculer ou d'inventer | Règle du prompt ; jeu adverse requis avant ouverture |

## Arrêt à chaud, bornes et audit (KAN-281 à KAN-284)

Le propriétaire a rendu M4 obligatoire pour tous le 2026-11-16 ; les garde-fous que la convention exigeait sont livrés le même jour. Les valeurs de départ (« Large ») sont celles qu'il a choisies et se règlent dans l'écran Paramètres, sans redéploiement.

| Garde-fou | Mise en œuvre | Preuve |
|---|---|---|
| Arrêt à chaud (KAN-281) | Paramètre `ia.vues-libres.actives` (1 ou 0) lu par le runtime à chaque question (`GET /parametres/vues-libres`) : à 0, l'agent ne reçoit plus l'outil et toute vue qui arriverait est retirée. Une politique illisible ferme les vues (échec fermé) ; chaque changement est audité comme tout paramètre | `copilot-runtime/test/app.test.mjs` (arrêt, reprise, échec fermé), `api/tests/test_parametre.py` |
| Taille (KAN-282) | 200 Ko de code au plus (`ia.vues-libres.taille-max.ko`) : les événements d'une vue sont mis en mémoire, une vue trop grosse est jetée sans qu'un morceau parte au navigateur (prix : la vue apparaît d'un bloc, sans affichage progressif) | Test du runtime |
| Nombre et fréquence (KAN-282) | 10 vues par réponse (`par-reponse`) et 60 par minute et par utilisateur (`par-minute`), compteurs en mémoire du runtime | Tests du runtime |
| Durée (KAN-282) | 15 s (`duree-max.secondes`) : une vue qui ne rend pas la main est retirée de l'écran (iframe détruite), côté navigateur (`avecDureeMaximale`) | `vues-libres.spec.ts` |
| Audit (KAN-283) | Chaque vue admise est inscrite au journal (`VUE_LIBRE_OUVERTURE` : fil et taille, jamais le contenu) AVANT d'être montrée ; si l'inscription échoue, la vue n'est pas montrée | Tests du runtime et de l'API |
| Jeu adverse (KAN-284) | 19 tentatives hostiles rejouées dans Chromium à chaque exécution de la CI (`frontend/e2e/vues-libres.spec.ts` : exfiltration par réseau, redirection, navigation du cadre, fenêtre, WebSocket, `eval`, cookies, parent, etc.), jugées par un point d'interception réseau : aucune requête ne doit sortir. Six cas de sécurité visant les vues libres sont ajoutés au banc de l'agent (`ia/evaluation/jeu_reference.json`, version 3) et sont rejoués à chaque exécution du banc, donc à chaque changement de modèle ou de prompt | Tests Playwright, banc |

**Faille trouvée par le jeu adverse et fermée.** La politique de contenu de l'iframe ne couvre pas la navigation du cadre lui-même : un `<meta http-equiv="refresh">` ou un `location.href` portant les données dans l'adresse sortait de l'application. Le document hôte porte maintenant `Content-Security-Policy: frame-src 'self'` (`frontend/nginx.conf`), qui s'applique à chaque navigation de ses cadres ; le cadre d'une vue est `about:srcdoc`, que la règle laisse passer. Le test lit la politique dans `nginx.conf` pour suivre le serveur.

## Limites connues

- La politique est posée par une balise dans le document de l'iframe : elle couvre le code de la vue, pas le moteur de la bibliothèque (le script en ligne du moteur est autorisé).
- Une bibliothèque autorisée doit être revalidée à chaque changement de version (adresse et version exactes dans `vues-libres.ts`).
- Aucune fonction de l'hôte : une future porte (relecture d'une donnée) demandera sa propre décision, droits revérifiés côté serveur et appel journalisé.
- Le jeu adverse du banc de l'agent vérifie que l'agent refuse ou signale la limite ; il ne prouve pas qu'aucune vue dangereuse ne soit jamais produite : c'est le rôle de l'isolation (iframe, politique de contenu, `frame-src`), testée dans Chromium, qui ne dépend pas du modèle.
- Les compteurs de fréquence sont en mémoire d'un seul runtime : un redémarrage les remet à zéro.
