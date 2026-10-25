# Passerelle LiteLLM — image `erp-rh-litellm`

Passerelle unique, compatible OpenAI, entre le service IA d'ERP-RH et les fournisseurs de modèles.
Décisions et état : [docs/ia.md](../docs/ia.md). Ce dossier ne contient **aucun secret** : la
configuration ne référence que des variables `os.environ/…`, fournies par le `.env` racine unique.

| Fichier | Rôle |
|---|---|
| `Dockerfile` | Image LiteLLM v1.104.2 épinglée par version et digest, configuration intégrée |
| `entrypoint.sh` | Refuse de démarrer sans `LITELLM_MASTER_KEY` (préfixe `sk-`), `LITELLM_SALT_KEY` ou `DATABASE_URL` |
| `filtrer_config.py` | Au démarrage, retire les déploiements dont la clé est vide (LiteLLM ne bascule pas sur une 401) |
| `litellm_config.yaml` | Alias `ai-gateway`, pools par tag, poids, limites, réglages du routeur |
| `test_providers.py` | Tests de fumée, bibliothèque standard Python uniquement |

## Fonctionnement

- Un seul alias : `ai-gateway`. Le client indique la tâche dans `metadata.tags` : `simple`, `medium`,
  `complex`, `code` ou `ocr`. **Toujours un tag** : sans tag, un pool `default` épuisé se rabat sur
  n'importe quel modèle de l'alias.
- Un modèle par tentative ; sur limite (429), délai ou erreur serveur, bascule vers un autre modèle
  **du même tag**, jusqu'à 4 modèles. Pas de bascule sur 400 ni 401 : une clé vide désactive donc ses
  modèles au démarrage. Pool épuisé : échec explicite, jamais un modèle plus faible ; LiteLLM le
  signale par « Not allowed to access model due to tags configuration ».
- Pool d'évaluation (NVIDIA Developer, preview Groq, essai Cerebras) : tags `eval…` seulement. La clé
  d'ERP-RH porte `metadata.tags: ["!eval"]` et ne peut jamais les atteindre.
- Une instance, un worker : l'état du routeur reste en mémoire, sans Redis. Base dédiée
  `litellm-db` (même image PostgreSQL que l'ERP, volume séparé) pour les clés virtuelles, budgets et
  journaux de dépense (30 jours).
- Réponses JSON validées contre le schéma demandé ; une réponse non conforme bascule sur un autre
  modèle. Cache désactivé.
- Les clés actuelles sont des **paliers gratuits** : données publiques ou synthétiques uniquement.

Pour une application, suivre les règles de [`conventions/agents-ia.md`](../conventions/agents-ia.md),
section « Passerelle de modèles ».

## Démarrer

Les services `litellm-db`, `litellm` et `ia` appartiennent au profil Compose `ia` du
`docker-compose.yml` racine ; la pile ERP n'en dépend pas.

```bash
docker compose --profile ia up -d litellm-db litellm
docker compose --profile ia logs -f litellm
```

Les valeurs des clés virtuelles sont déjà dans le `.env` racine (`IA_LITELLM_API_KEY`, `LITELLM_TEST_API_KEY`).
Une fois la passerelle prête, les enregistrer (une fois ; relancer ne change rien) :

```bash
python litellm/enregistrer_cles.py
```

| Variable | Clé | Droits |
|---|---|---|
| `IA_LITELLM_API_KEY` | `erp-rh-ia` | `ai-gateway` seulement, `metadata.tags: ["!eval"]`, 60 requêtes/min |
| `LITELLM_TEST_API_KEY` | `smoke-tests` | `ai-gateway` et `ai-gateway-selftest` (tests de `test_providers.py`) |

Pour une nouvelle valeur, la générer (`python -c "import secrets;print('sk-'+secrets.token_hex(24))"`), la placer
dans le `.env`, puis relancer le script ; supprimer l'ancienne clé dans l'interface LiteLLM.

## Tester

| Commande | Requêtes | Vérifie |
|---|---|---|
| `python litellm/test_providers.py --list` | 0 | Pools et pourcentages lus dans la configuration |
| `python litellm/test_providers.py --production-key <CLE>` | 2, refusées par la passerelle | La clé refuse le pool `eval` et l'alias de test |
| `python litellm/test_providers.py --providers` | 1 par modèle | Chaque clé, chaque nom de modèle, l'OCR réel |
| `python litellm/test_providers.py` | 10 | Routage des tags, OCR, sortie JSON, ancrage, abstention, bascule |

Le script lit `LITELLM_GATEWAY_URL` et `LITELLM_TEST_API_KEY` dans le `.env` racine.

## Mettre à jour LiteLLM

1. Lire les notes de version ; sauvegarder la base `litellm-db`.
2. Remplacer le tag **et** le digest dans le `Dockerfile`
   (`docker buildx imagetools inspect ghcr.io/berriai/litellm:<tag>`). Jamais `latest`.
3. Relancer `--providers`, la suite complète et `--production-key` : bascule et exclusion `!eval`
   dépendent de la version.

## Diagnostic

- **401 « Not allowed to access model due to tags configuration »** : pool du tag en cooldown
  (quotas épuisés) ou clé qui exclut `eval`.
- **401/403 d'un fournisseur** : clé vide ou invalide ; `--providers` indique le modèle concerné.
- **429** : quota du fournisseur ou limite locale ; le routeur bascule sur le même tag.
- **Modèle inattendu** : vérifier `metadata.tags` (une faute de frappe envoie vers `default`) et
  l'en-tête `x-litellm-model-id`.
