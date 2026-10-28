# Passerelle LiteLLM — image `erp-rh-litellm`

Passerelle unique, compatible OpenAI, entre le service IA d'ERP-RH et les fournisseurs de modèles.
Décisions et état : [docs/ia.md](../docs/ia.md). Ce dossier ne contient **aucun secret** : la
configuration ne référence que des variables `os.environ/…`, fournies par le `.env` racine unique.

| Fichier | Rôle |
|---|---|
| `Dockerfile` | Image LiteLLM v1.104.2 épinglée par version et digest, configuration intégrée |
| `entrypoint.sh` | Refuse de démarrer sans `LITELLM_MASTER_KEY` (préfixe `sk-`), `LITELLM_SALT_KEY` ou `DATABASE_URL` |
| `filtrer_config.py` | Au démarrage, retire les déploiements dont la clé est vide (LiteLLM ne bascule pas sur une 401) |
| `litellm_config.yaml` | Groupes officiels par capacité, poids, limites, réglages du routeur |
| `test_providers.py` | Tests de fumée, bibliothèque standard Python uniquement |

## Fonctionnement

- Cinq groupes officiels : `ai-gateway-simple`, `ai-gateway-medium`, `ai-gateway-complex`,
  `ai-gateway-code`, `ai-gateway-ocr`. Le client sélectionne le groupe avec le champ OpenAI `model`.
  Les tags restent des métadonnées d'observation ; `enable_tag_filtering` est désactivé.
- `simple-shuffle` et `enable_weighted_failover` utilisent les composants officiels LiteLLM :
  un fournisseur par tentative, jusqu'à trois bascules dans le même groupe. Pas de repli vers une autre capacité.
  Les groupes `ai-gateway-eval-*` et `ai-gateway-test-*` sont réservés aux clés de test.
- Fournisseurs : Gemini, Groq, Mistral Experiment, Cloudflare, OpenRouter `:free`, Z.ai Flash, NVIDIA
  NIM (offre de prototypage), LLM7 (jeton gratuit par e-mail ; seuls `gpt-oss:20b` et `codestral-latest` sont gratuits) et
  Cohere (clé d'essai : 20 requêtes/min, 1 000 appels/mois, non commerciale ; en évaluation seulement, sauf `command-r7b`).
  SambaNova n'est plus gratuit : écarté. Les modèles sont sondés (outils + JSON) avant d'entrer dans un pool.
- La clé applicative est autorisée uniquement sur les cinq groupes de production. Les permissions
  LiteLLM sur les modèles excluent les groupes d'évaluation, les sondes directes et `ai-gateway-selftest`.
- Une instance, un worker : l'état du routeur reste en mémoire, sans Redis. Base dédiée
  `litellm-db` (même image PostgreSQL que l'ERP, volume séparé) pour les clés virtuelles, budgets et
  journaux de dépense (30 jours).
- Réponses JSON validées contre le schéma demandé ; une réponse non conforme bascule sur un autre
  modèle. Cache désactivé.
- Les clés actuelles sont des **paliers gratuits**, qui peuvent utiliser les requêtes pour entraîner
  leurs modèles ; les données réelles y sont admises par décision du propriétaire (docs/ia.md, § 2).

Pour une application, suivre les règles de [`conventions/agents-ia.md`](../conventions/agents-ia.md),
section « Passerelle de modèles ».

## Démarrer

Les services `litellm-db`, `litellm`, `litellm-cles` et `ia` démarrent par défaut avec le reste du
`docker-compose.yml` racine, sans profil ; la pile ERP n'en dépend pas.

```bash
docker compose pull && docker compose up -d
docker compose logs -f litellm
```

Les valeurs des clés virtuelles sont dans le `.env` racine (`IA_LITELLM_API_KEY`, `LITELLM_TEST_API_KEY`). La tâche
ponctuelle `litellm-cles` les enregistre à chaque `up -d` dès que la passerelle est prête, puis s'arrête en
`Exited (0)` ; les groupes autorisés des clés connues sont synchronisés (`[SYNCHRO]`) ; une clé déjà conforme reste telle quelle (`[DÉJÀ]`).
Hors Compose, contre une passerelle d'essai, le même script se lance à la main :

```bash
python litellm/enregistrer_cles.py
```

| Variable | Clé | Droits |
|---|---|---|
| `IA_LITELLM_API_KEY` | `erp-rh-ia` | Cinq groupes de production uniquement, 60 requêtes/min |
| `LITELLM_TEST_API_KEY` | `smoke-tests` | Groupes de production, évaluation, sondes et selftest |

Pour une nouvelle valeur, la générer (`python -c "import secrets;print('sk-'+secrets.token_hex(24))"`), la placer
dans le `.env`, puis relancer le script ; supprimer l'ancienne clé dans l'interface LiteLLM.

## Tester

| Commande | Requêtes | Vérifie |
|---|---|---|
| `python litellm/test_providers.py --list` | 0 | Pools et pourcentages lus dans la configuration |
| `python litellm/test_providers.py --production-key <CLE>` | 3, refusées par la passerelle | La clé refuse le pool `eval` et l'alias de test |
| `python litellm/test_providers.py --providers` | 1 par modèle | Chaque clé, chaque nom de modèle, l'OCR réel |
| `python litellm/test_providers.py` | 10 | Routage des groupes, OCR, sortie JSON, ancrage, abstention, bascule |

Le script lit `LITELLM_GATEWAY_URL` et `LITELLM_TEST_API_KEY` dans le `.env` racine.

## Mettre à jour LiteLLM

1. Lire les notes de version ; sauvegarder la base `litellm-db`.
2. Remplacer le tag **et** le digest dans le `Dockerfile`
   (`docker buildx imagetools inspect ghcr.io/berriai/litellm:<tag>`). Jamais `latest`.
3. Relancer `--providers`, la suite complète et `--production-key` : bascule et permissions des groupes
   dépendent de la version.

## Diagnostic

- **401/403 de la passerelle** : vérifier les groupes autorisés sur la clé (`litellm-cles` les synchronise).
- **401/403 du fournisseur** : clé fournisseur invalide ou indisponible ; la sonde ciblée identifie le déploiement.
- **429** : quota fournisseur ou limite locale ; vérifier les tentatives de bascule dans le même groupe.
- **Modèle inattendu** : comparer le groupe demandé et `x-litellm-model-id` aux déploiements configurés.
- **Défaut upstream des tags avec garde-fou** : [#45543](https://github.com/BerriAI/litellm/issues/45543)
  reste présent dans les versions officielles vérifiées jusqu'à 1.106.5. Les groupes par `model_name`
  évitent ce défaut de sélection sans modifier LiteLLM ni désactiver `litellm_content_filter`.
  L'attribution des métadonnées de dépense reste à surveiller jusqu'au correctif upstream.
