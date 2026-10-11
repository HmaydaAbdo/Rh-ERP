# Informations à fournir pour le déploiement

Ce document suit les éléments nécessaires pour aligner les procédures du dépôt avec l'exploitation
réelle du serveur. Ne pas transmettre de clé privée, mot de passe, jeton ni autre secret.

## Nginx outer

Le nginx outer existe déjà sur le serveur. Avant de proposer un changement pour rh-erp, l'exploitant
doit fournir un exemple des blocs `server` et `location` concernés, avec les secrets retirés. Cela
permettra de vérifier l'URL publique et le sous-chemin, le port transmis à nginx inner, les en-têtes
proxy, la réécriture du cookie de rafraîchissement et le traitement de `<base href>`.

Aucune modification de la configuration nginx outer ne doit être proposée avant cette comparaison.

## CD

La stratégie envisagée reste à valider : déploiement sur les tags `v*` après réussite de la CI,
connexion SSH depuis GitHub Actions et vérification de santé après `docker compose pull` puis
`docker compose up -d`. Pour préparer la mise en œuvre, confirmer les paramètres d'exploitation du
serveur et les secrets GitHub Actions à créer. Ne jamais inscrire les valeurs secrètes dans ce
fichier ou dans le dépôt.

Le CD de production reste bloqué jusqu'à la migration PostgreSQL 17 vers PostgreSQL 18 décrite dans
[`deployment.md`](deployment.md#migration-majeure-pg17--pg18-en-production).
