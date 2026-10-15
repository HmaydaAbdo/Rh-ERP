# Informations à fournir pour le déploiement

Ce document suit les éléments nécessaires pour aligner les procédures du dépôt avec l'exploitation
réelle du serveur. Ne pas transmettre de clé privée, mot de passe, jeton ni autre secret.

## Nginx outer

Le nginx outer existe déjà sur le serveur. Avant de proposer un changement pour rh-erp, l'exploitant
doit fournir un exemple des blocs `server` et `location` concernés, avec les secrets retirés. Cela
permettra de vérifier l'URL publique et le sous-chemin, le port transmis à nginx inner, les en-têtes
proxy, la réécriture du cookie de rafraîchissement et le traitement de `<base href>`.

Aucune modification de la configuration nginx outer ne doit être proposée avant cette comparaison.

## CD automatisé

Le déploiement de production reste manuel par un opérateur autorisé ; aucune connexion SSH de GitHub
Actions au serveur n'est configurée. L'automatisation du CD est une évolution distincte, non requise
pour la migration PostgreSQL déjà réalisée ni pour la procédure manuelle documentée dans
[`deployment.md`](deployment.md). Si elle est décidée, confirmer au préalable les
paramètres du serveur et les secrets GitHub Actions à créer. Ne jamais inscrire de valeur secrète dans
ce fichier ou dans le dépôt.
