# ADR 0003 — Restreindre CORS aux origines de l’environnement

- **Statut** : accepté
- **Date** : 2026-10-11
- **Décideur** : propriétaire du projet

## Contexte

Le backend autorisait toutes les origines avec `allowCredentials=true` via
`allowedOriginPatterns("*")`. Cette configuration entrait en conflit avec
`conventions/security.md`, qui demande de limiter CORS aux origines nécessaires, et
avec `conventions/configuration.md`, qui demande de valider les paramètres propres à
l’environnement.

`FRONTEND_URL` ne peut pas servir directement de liste CORS : il peut contenir le
sous-chemin public `/rh-erp` utilisé dans les liens de réinitialisation de mot de passe,
alors qu’une origine CORS ne contient que le schéma, l’hôte et éventuellement le port.

## Décision

Chaque environnement fournit `CORS_ALLOWED_ORIGINS`, une liste séparée par des virgules.
Le backend la valide au démarrage et refuse les valeurs vides, les wildcards, les
schémas autres que HTTP(S), les chemins et les informations d’identification URI.
Spring Security applique la liste avec `allowedOrigins`; les credentials restent activés
uniquement pour les origines déclarées.

- développement : `http://localhost:4200` dans `backend/.env.example` ;
- production : l’origine publique réelle, par exemple `https://<domaine>`, sans `/rh-erp`.

## Conséquences

- Une nouvelle origine nécessite une modification de la configuration de l’environnement,
  sans changement de code.
- Une origine oubliée est refusée par le navigateur, ce qui est observable par le contrôle
  de pré-vol et les journaux du proxy ; elle ne doit pas être ajoutée par wildcard.
- `FRONTEND_URL` reste la source du lien d’e-mail et peut conserver son sous-chemin.

## Preuves

- `SecurityConfig` valide et applique les origines explicites.
- `JwtSecurityChainTest` vérifie un pré-vol autorisé et un pré-vol refusé.
- `docs/configuration.md`, `docs/deployment.md` et les exemples `.env` décrivent la source
  et le format de la configuration.
