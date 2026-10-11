# Sauvegarde et restauration

Cette convention définit les garanties attendues pour les copies de données et la reprise. Chaque
application documente les éléments couverts, la fréquence, la rétention, la destination, le
responsable, les objectifs de reprise et la procédure de restauration.

## Périmètre et objectifs

* Identifier les données faisant autorité, les configurations nécessaires à leur restauration et
  les dépendances entre elles. Les caches, index dérivés et autres projections peuvent être exclus
  s'ils sont reconstructibles et si leur reconstruction est testée.
* Définir pour chaque périmètre un objectif de point de reprise (perte de données maximale) et un
  objectif de délai de reprise. La fréquence, la rétention et les ressources de restauration en
  découlent ; elles ne sont pas fixées universellement par cette convention.
* Sauvegarder également les clés et informations nécessaires au déchiffrement ou à l'accès aux
  sauvegardes, en les protégeant séparément. Sans elles, une copie chiffrée peut être inutilisable.
* Préciser si les journaux techniques ou d'audit doivent être inclus selon leur finalité, leurs
  obligations de conservation et la politique de reprise. Les archives de logs ne remplacent pas une
  sauvegarde des données de l'application.

## Création et stockage

* Produire des sauvegardes cohérentes avec l'état des données. Utiliser les mécanismes natifs du
  stockage et documenter les précautions nécessaires pour les données réparties entre plusieurs
  services.
* Vérifier chaque sauvegarde : statut de l'opération, taille ou objets attendus, intégrité et
  accessibilité. Alerter sur les exécutions absentes, incomplètes ou invalides.
* Chiffrer les transferts et les sauvegardes contenant des informations confidentielles. Restreindre
  l'accès aux seuls rôles responsables de la sauvegarde et de la restauration ; ne jamais exposer
  leur contenu dans les journaux.
* Garder les sauvegardes indépendantes des données opérationnelles, des conteneurs et de leurs
  volumes. Prévoir une copie hors de l'hôte ou un mécanisme équivalent contre la perte ou la
  compromission du système principal. Une copie locale seule n'est pas une stratégie de reprise
  suffisante.
* Pour un déploiement Docker Compose, un répertoire local de transit peut être placé dans
  `./backups/`, à côté du fichier Compose. Il est exclu du contrôle de version et ne constitue pas
  l'unique destination de sauvegarde.
* Appliquer la durée de conservation décidée, purger les copies expirées de façon contrôlée et
  prévenir l'épuisement du stockage. Conserver les traces d'exécution et de purge sans exposer de
  secret ou de contenu sauvegardé.

## Restauration et vérification

* Maintenir une procédure qui nomme les prérequis, les personnes autorisées, l'ordre des composants,
  les secrets nécessaires, les contrôles d'intégrité et la décision de retour en service.
* Tester régulièrement la restauration dans un environnement isolé. Vérifier que les données sont
  lisibles, que les services démarrent, que les migrations et dépendances correspondent et que les
  objectifs de reprise peuvent être atteints.
* Ne jamais tester une restauration en écrasant les seules données de production. Protéger les
  copies de test au même niveau que les données qu'elles contiennent et supprimer les environnements
  de test selon leur procédure.
* Après une restauration réelle, vérifier l'intégrité métier, les permissions, les journaux et la
  synchronisation des dépendances avant de rouvrir les accès.
* Réviser la procédure après toute évolution de stockage, de schéma, de chiffrement ou d'infrastructure.

## Références

* [CISA StopRansomware Guide — backups](https://www.cisa.gov/stopransomware/ransomware-guide)
* [NIST SP 800-34 Rev. 1 — contingency planning](https://csrc.nist.gov/pubs/sp/800/34/r1/upd1/final)
