# Décision — rétablir les pools LiteLLM avec les groupes de modèles officiels

Statut : adoptée par le propriétaire le 2026-10-28 ; implémentation locale validée pour le routage et les contrôles ci-dessous.

## Diagnostic vérifié

Le proxy local 1.104.2 conserve le défaut upstream [#45543](https://github.com/BerriAI/litellm/issues/45543).
Le garde-fou `pre_call` crée `litellm_metadata` et masque les tags dans `metadata`.
Le ciblage Gemini par tag a rendu Ministral ; le filtre officiel appelé directement rend Gemini.
Un essai avec le champ natif `litellm_metadata` a également rendu le mauvais modèle : ce réglage seul ne résout pas le problème.

L'API GitHub officielle confirme que [#45585](https://github.com/BerriAI/litellm/pull/45585) reste ouverte et non fusionnée.
Le code publié de la stable `v1.106.5` (27 octobre), de `v1.109.0-dev.1` et de `main` contient encore le même helper fautif.
Une montée de version vers ces versions ne constitue donc pas le correctif recherché.

## Solution recommandée avec les composants officiels existants

Utiliser les [groupes de modèles LiteLLM](https://docs.litellm.ai/docs/routing) par capacité.
Le champ OpenAI `model` sélectionne le groupe ; le routeur officiel choisit le déploiement et applique les bascules.

| Usage | Groupe demandé | Contenu |
|---|---|---|
| Résumé / sélection d'outils | `ai-gateway-simple` | Déploiements actuellement marqués `simple` |
| Réponse courante | `ai-gateway-medium` | Déploiements actuellement marqués `medium` |
| Raisonnement complexe | `ai-gateway-complex` | Déploiements actuellement marqués `complex` |
| Code | `ai-gateway-code` | Déploiements actuellement marqués `code` |
| Image | `ai-gateway-ocr` | Déploiements actuellement marqués `ocr` |
| Modèles d'évaluation | `ai-gateway-eval-*` | Déploiements opt-in actuels ; clé applicative non autorisée |
| Sonde d'un déploiement | `ai-gateway-test-*` | Un seul déploiement ; clé de test seulement |

Les métadonnées conservent les tags pour l'observabilité. L'appartenance aux pools est assurée par `model_list.model_name`.
Le garde-fou `litellm_content_filter` reste actif avant les appels. Aucun patch du framework, hook de réparation ou routeur maison.
Le raccordement LangChain construit le nom de groupe depuis la capacité existante `Tache`.
La clé applicative reçoit la liste explicite des cinq groupes de production ; les groupes eval et test restent exclus par les permissions de modèles LiteLLM.
Le service Compose `litellm-cles` doit synchroniser les permissions des clés déjà enregistrées, sans changer leur valeur.

## Lot adopté

1. Configurer les groupes dans LiteLLM, adapter le raccordement LangChain et les sondes existantes.
2. Synchroniser les permissions des clés dans le service Compose existant ; documenter le changement du contrat de modèle.
3. Conserver la version et le digest épinglés ; aucune migration de base nécessaire pour ce changement de groupes.
4. Reconstruire et redémarrer uniquement les services concernés en local.
5. Vérifier chaque pool et un déploiement précis par `x-litellm-model-id` ; vérifier les refus eval/test avec la clé applicative et le blocage d'une injection par le garde-fou.
6. Exercer la bascule officielle, puis reprendre l'évaluation V1c ciblée et complète, la latence et T20.

Modèle adapté : Sonnet. Le propriétaire a validé le changement du contrat « un alias unique + tags » vers les groupes officiels. La version 1.104.2 reste épinglée : cette correction de configuration ne nécessite pas de migration de la base LiteLLM.
Pas de push ni CI dans ce lot sans demande explicite. Heures supplémentaires exclues.

## Preuves locales

Validation locale du 2026-10-28 : 11 tests IA ciblés réussis ; les cinq groupes répondent dans leur pool, OCR réel compris. Un ciblage individuel Groq20 réussit ; trois refus 403 confirment l’exclusion eval/test/selftest de la clé applicative. Une injection est bloquée en 400 ; la sonde de bascule et une bascule réelle du groupe complex réussissent. Un appel autorisé avec la clé applicative réussit. La resynchronisation des clés est idempotente. Ruff ciblé, compilation Python des scripts et validation Compose passent. V1c reste ouverte pour les évaluations métier, p95 et T20.

Les images locales LiteLLM et IA ont été reconstruites ; les services `litellm`, `ia` et `ia-db` sont sains. Aucune publication ni CI lancée.
