# Décisions et informations de déploiement

Ce document suit les éléments nécessaires pour aligner les procédures du dépôt avec l'exploitation
réelle du serveur. Ne pas transmettre de clé privée, mot de passe, jeton ni autre secret.

## Accès d'administration

Le propriétaire confirme le 2026-10-16 qu'il n'utilisera pas SSH. Aucune connexion SSH ni aucun
déploiement GitHub Actions ne sont à configurer pour ce serveur.

## Nginx outer — configuration examinée le 2026-10-16

L'extrait fourni montre Nginx sous Windows, avec un `server` sur le port HTTP 80 et `server_name
localhost`. La route `/erp-rh/` transmet vers `127.0.0.1:5002/`, avec les en-têtes proxy, la
réécriture du cookie `/auth` vers `/erp-rh/auth` et le remplacement du `<base href>`.

Le routage sous-chemin correspond au schéma décrit dans [`deployment.md`](deployment.md). Le propriétaire
confirme que l'accès actuel est `http://staport.dyndns.org:650/erp-rh/login` et veut étudier HTTPS dans
une session séparée. La valeur CORS correspondante est l'origine `http://staport.dyndns.org:650`, sans
chemin ; le contrôle hôte du 2026-10-17 confirme cette valeur dans le `.env`. Le contrôle confirme
également un secret JWT Base64 d'au moins 256 bits, Swagger désactivé dans le conteneur et l'absence de
spécification OpenAPI ou d'interface Swagger aux deux URL publiques. Ces sorties ne permettent pas de
confirmer que le JWT est unique à la production. `COOKIE_SECURE=false` est actuellement cohérent avec
HTTP ; il devra être activé après HTTPS. L'extrait ne montre pas de listener HTTPS. Aucune configuration
Nginx du serveur n'a été modifiée ; HTTPS reste suivi dans `TODO.md`.

## Décision CD — 2026-10-16

Le déploiement restera manuel par un opérateur autorisé : il n'y a pas d'environnement de staging et
aucun déploiement continu via GitHub Actions n'est souhaité. Le propriétaire a choisi de suivre le tag
`latest` pour les six images Compose, après réussite de la CI sur `main`. Sur le serveur, `docker compose pull`
et `docker compose up -d` incluent tous les services, sauvegarde, rétention pgAudit et IA compris, sans profil ni
option (depuis le 2026-10-26). Cette configuration ne lance pas une restauration. La décision de tag et ses conséquences sont décrites dans [`ADR 0004`](adr/0004-production-latest-tag.md)
et [`deployment.md`](deployment.md). Aucun secret n'est consigné dans ce fichier.
