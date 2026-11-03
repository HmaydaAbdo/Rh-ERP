---
title: Configuration
sidebar_position: 8
---

# Configuration

Principes inchangés : 12-factor, configuration par l'environnement, échec rapide au démarrage, aucun secret dans le dépôt ni dans une image, un seul endroit par réglage.

## Mise en œuvre (pydantic-settings)

* Une classe `Settings(BaseSettings)` par domaine ou par préoccupation de `platform`, composée dans un objet racine. Le préfixe d'environnement est déclaré
  (`env_prefix="STAPORT_"`), le fichier `.env` n'est lu qu'en local (`env_file`).
* Les secrets en `SecretStr` ; en conteneur, ils viennent de fichiers montés (`secrets_dir`) ou de variables d'environnement, jamais d'une valeur par défaut.
  **Aucun secret n'a de valeur par défaut** : une valeur manquante empêche le démarrage.
* `extra="forbid"` : une variable inconnue du préfixe est une erreur, pas un silence (évite les fautes de frappe qui laissent un réglage de sécurité à sa valeur par défaut).
* Validation à la construction (bornes, URL, durées) ; la configuration est construite **une fois** et injectée par une dépendance, pas lue à la volée dans le code métier.
* Les profils Spring disparaissent : un environnement = un jeu de variables. Le comportement ne change pas selon un nom de profil caché dans le code.

## Tests

La configuration se remplace par une instance dédiée via `dependency_overrides`, jamais par modification de l'environnement du processus qui fuirait entre tests.
Un test vérifie que le démarrage échoue si un secret requis manque.

## Variables existantes

Les noms de variables d'environnement actuels (`.env.example`) sont conservés tant que possible pour que le déploiement ne change pas ; tout renommage est listé dans
[règles supprimées ou changées](./regles-changees.md) et dans `docs/deployment.md`.
