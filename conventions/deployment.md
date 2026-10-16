# Déploiement et exploitation avec Docker

> Les processus applicatifs et leurs dépendances gérées par le projet s'exécutent dans des
> conteneurs Docker en développement, en test et en production. Les services externes consommés par
> API restent des intégrations externes, pas des composants à copier dans le Compose.

## Compose par environnement

Docker Compose est l'interface commune pour construire, démarrer et arrêter les services du projet.
Un même modèle Compose peut être complété par des profils ou des fichiers d'override pour les
différences entre développement, test et production ; garder ces différences explicites et
vérifiables.

* En développement, le code peut être monté ou synchronisé dans le conteneur pour le rechargement
  rapide, mais le processus de l'application s'exécute dans son conteneur.
* En CI, les tests et leurs dépendances s'exécutent dans des conteneurs reproductibles.
* En production, exécuter des images construites et testées par la CI. Ne pas monter le code source
  depuis l'hôte ni compiler l'application sur le serveur de production.
* Ne pas mélanger par inadvertance les montages, ports de développement et valeurs de débogage avec
  la configuration de production.

Commandes usuelles depuis le répertoire de Compose :

```sh
docker compose up --build
docker compose down
docker compose -f compose.yaml -f compose.production.yaml up -d
```

## Images et conteneurs

* Utiliser des images minimales et maintenues. Une mise à jour d'image est testée avant déploiement.
  Préférer une version immuable ou le digest en production. Un tag mutable tel que `latest` exige
  une décision d'exploitation documentée, la validation CI avant le pull et l'acceptation explicite
  d'un retour arrière moins direct.
* Construire les images applicatives de façon reproductible, avec des étapes de build séparées de
  l'image d'exécution lorsque cela convient à la pile technique.
* Exécuter les processus sans privilèges root. Ne pas utiliser `privileged` ou ajouter des
  capacités système sans nécessité documentée. Réduire les paquets, ports, fichiers et permissions
  accessibles au conteneur.
* Conserver les données persistantes hors du système de fichiers éphémère du conteneur : volume
  nommé, stockage persistant ou service de données géré, selon l'architecture du projet.
* Déclarer uniquement les services nécessaires : application, stockage, traitements asynchrones,
  proxy d'entrée ou outils locaux. Le nombre et les noms des services sont propres au projet.

## Configuration et secrets

Fournir la configuration par les mécanismes de l'environnement Docker et appliquer
`conventions/configuration.md` : valeurs typées et validées, source faisant autorité, secrets séparés
de la configuration ordinaire.

* Ne jamais inscrire un secret dans une image, un Dockerfile, un fichier Compose versionné, les
  arguments de build ou les journaux.
* En production, fournir les secrets au moyen du gestionnaire de secrets de la plateforme ou d'un
  mécanisme Docker sûr adapté au mode de déploiement. Ne pas passer un secret comme variable
  d'environnement lorsque le mécanisme de secrets est disponible.
* Les fichiers de secrets de développement sont locaux, exclus du dépôt et remplacés par des
  valeurs de test sans privilège en CI.
* Un fichier d'exemple peut documenter les noms et formats attendus, mais ne contient que des valeurs
  fictives. Les contrôles requis échouent au démarrage si leur configuration manque ou est invalide.

## Réseaux et exposition

* N'exposer que le point d'entrée nécessaire aux utilisateurs ou aux opérations. Ne pas publier
  directement les bases de données, files de messages ou services internes sur une interface réseau
  publique.
* Relier les services uniquement aux réseaux dont ils ont besoin. Le contrôle d'accès réseau de
  l'hôte ou du cloud complète cette segmentation ; il ne la remplace pas.
* Lorsqu'un port doit être accessible uniquement depuis l'hôte, le lier à l'interface de boucle
  locale. Documenter tout port ouvert à un autre réseau et sa protection.
* Si un proxy transmet des en-têtes d'identité ou d'adresse client, le backend ne fait confiance
  qu'aux proxys explicitement identifiés. Rejeter ou ignorer ces en-têtes lorsqu'ils viennent d'une
  source non fiable.
* Le chiffrement TLS est terminé au point d'entrée de confiance défini par le déploiement. Les
  communications entre réseaux ou services sensibles utilisent le niveau de chiffrement exigé par
  leur risque.

## Démarrage, santé et arrêt

Chaque service définit une vérification de santé qui reflète sa capacité utile à traiter le travail,
sans dépendre inutilement d'une intégration secondaire non critique. Les services dépendants attendent
la disponibilité requise ; les processus applicatifs réessaient proprement leurs connexions après un
démarrage ou une interruption du service amont. `depends_on` et un healthcheck peuvent séquencer le
démarrage Compose, mais ne remplacent pas la résilience à l'exécution.

Définir des politiques d'arrêt et de redémarrage adaptées. Le processus doit libérer proprement ses
ressources, terminer ou interrompre les travaux selon la règle du domaine et éviter de traiter deux
fois une opération non idempotente.

## Base de données et migrations

* Exécuter les migrations Flyway dans le cadre du déploiement, avant que la nouvelle version ne
  dépende du schéma modifié. Garantir qu'une seule tâche de migration opère à la fois. Toute
  migration est testée sur le moteur relationnel cible selon `conventions/database.md`.
* Lors d'un changement de majeure PostgreSQL, ne jamais réutiliser le volume de données de l'ancienne
  majeure. Répéter l'export/restauration logique vers un volume neuf, suspendre les écritures pendant
  la bascule, appliquer les migrations Flyway en attente et vérifier données, extensions, droits et
  démarrage avant de rouvrir le trafic. Conserver intact l'ancien volume jusqu'à validation ; après
  reprise des écritures, le retour arrière nécessite leur réconciliation.
* Le compte de migration est distinct du compte d'exécution lorsque le modèle de sécurité ou d'audit
  l'exige. Le compte applicatif suit le moindre privilège ; les droits d'audit sont définis dans
  `conventions/audit.md`.
* Pour un déploiement progressif, garder temporairement le schéma compatible avec la version
  précédente : ajouter, migrer les données, basculer le code, puis retirer les anciennes structures
  dans une migration ultérieure. Documenter le retour arrière si une migration peut rendre les
  données incompatibles.
* Les images applicatives et migrations gardent les mêmes versions entre test, staging et
  production ; seules les configurations propres à l'environnement changent.

## CI, publication et déploiement

La CI exécute les contrôles et tests pertinents, puis construit les images Docker à partir du commit
à livrer. La publication attend la réussite de toutes les portes obligatoires et de la construction
de toutes les images. Les images validées sont publiées dans un registre et promues entre environnements
par leur identifiant immuable ; ne pas reconstruire une image différente pour la production.

* Ne jamais publier d'image de production depuis un changement non approuvé ou un contexte qui peut
  exposer des identifiants du registre.
* Analyser les dépendances et les images selon le risque, produire un inventaire logiciel si le
  projet ou son environnement l'exige, et traiter les vulnérabilités selon une politique documentée.
* Séparer la construction de l'image de son déploiement. Après déploiement, vérifier la santé et les
  indicateurs attendus ; arrêter ou revenir à la dernière version saine si les critères de réussite
  ne sont pas atteints.
* Documenter les opérations manuelles, l'identité autorisée à les exécuter et les critères de retour
  arrière dans la documentation de déploiement du projet.

## Sauvegarde et reprise

Avant la production, définir pour chaque donnée persistante les objectifs de perte de données et de
reprise, la fréquence et la rétention des sauvegardes, leur destination et leur responsable.
Conserver les sauvegardes indépendamment des conteneurs et volumes opérationnels, limiter leur
accès, puis tester régulièrement une restauration. Un volume Docker persistant ne constitue pas à
lui seul une sauvegarde. Une destination hors hôte est recommandée ; si le propriétaire accepte une
stratégie limitée à l'hôte, documenter explicitement le risque de perte ou de compromission de cet
hôte. Appliquer `conventions/backup.md` et documenter les destinations retenues dans la procédure du
projet.

Les fichiers d'exploitation locaux, notamment `logs/` et `backups/`, sont placés à côté du fichier
Compose, exclus du contrôle de version et montés explicitement dans les conteneurs qui en ont besoin.
Les permissions hôte doivent permettre l'écriture par l'UID/GID non privilégié du processus du
conteneur.

## Intégration de code

`main` contient les changements intégrés. Les changements passent par une pull request et les
branches distantes de travail sont supprimées après leur fusion ; un travail repris après fusion
repart de `main` à jour. La CI valide le commit avant la publication de son image.
