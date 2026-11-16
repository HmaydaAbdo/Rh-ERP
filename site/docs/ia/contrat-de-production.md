# Contrat de production de CopilotKit

Page de référence : *production lifecycle* de la documentation officielle CopilotKit Angular (KAN-97).

| Point du contrat | Décision | Preuve |
|---|---|---|
| Détection de changement | **Sans zone** (aucun `zone.js` ni polyfill dans `angular.json`, `main.ts`) : conforme au réglage recommandé. | Construction de production |
| Hydratation et rendu serveur | **Non applicable** : application purement cliente, pas de SSR. À revoir si le rendu serveur est adopté un jour. | — |
| Propriété et nettoyage | La racine de l'assistant crée un injecteur d'environnement pour CopilotKit ; il est **détruit avec le composant** (`DestroyRef`), ce qui arrête les services de la bibliothèque (abonnements, enregistrements, minuteries). | `assistant-racine.component.spec.ts` |
| `connectAgentContext` | Déjà utilisé par `assistant.component.ts` (contexte de page). | Code |
| `injectCapabilities`, `injectCopilotKitConfig`, `CopilotKitAgentContext` | **Non adoptés pour l'instant** : aucun besoin métier ; le contexte passe déjà par `connectAgentContext`. Réévaluer avec les modes M1 à M3 (KAN-101). | — |
| `selfManagedAgents` | **Non adopté** : l'agent est servi par le runtime Node (`/api/copilotkit`), jamais instancié dans le navigateur. | — |

## Budget de taille

Mesures de la construction de production (2026-11-16) :

- **Avant KAN-270** : initial 911 kB brut (157 kB transférés), assistant 4,86 Mo en chargement différé.
- **Depuis KAN-270** (décision du propriétaire, voie officielle stricte : CopilotKit fourni à la racine pour que chaque page enregistre ses outils) : initial **7,28 Mo brut (2,07 Mo transférés)**. Budget fixé à 7,5 Mo (avertissement) et 8 Mo (erreur). Retour possible : un petit registre de ponts, au prix de code maison.
- Style du composant `app-shell` : seuil d'avertissement de 8 à **10 kB** (erreur à 16 kB inchangée).

## Inspecteur de développement (KAN-98)

L'inspecteur de la bibliothèque ne se monte que si le navigateur, le mode développement **et** la configuration l'autorisent (`shouldEnableInspector`). Il est coupé deux fois : le mode développement n'existe pas en production, et `enableInspector: false` le refuse même en développement (test dans `assistant-racine.component.spec.ts`). Son code vit dans un morceau différé, importé seulement au montage, donc jamais téléchargé. Ses fils enrichis exigent Intelligence (exclu).
