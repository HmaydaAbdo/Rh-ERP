---
title: Audit
sidebar_position: 6
---

# Audit des données et des actions

Les exigences de `conventions/audit.md` ne changent pas : qui, quoi, quand, avant/après, sur toute donnée métier, sans secret ni donnée inutile dans la trace, historique non
modifiable par le compte d'exécution. Seul le mécanisme d'Hibernate Envers est remplacé (ADR 0016, § 3). Les tables `*_aud` et leur historique existant sont **conservés**.

## Mécanisme

* Un écouteur de session SQLAlchemy sur l'événement `before_flush` parcourt les objets nouveaux (`session.new`), modifiés (`session.dirty`) et supprimés
  (`session.deleted`) des modèles marqués « audités », et ajoute à la même session les lignes `<table>_aud` correspondantes. L'audit et la donnée sont donc validés
  dans **la même transaction** : pas de donnée sans trace, pas de trace sans donnée.
* Le marquage « audité » est une propriété du modèle (mixin ou attribut de classe) ; un modèle sans ce marquage n'est pas tracé. Le test de couverture (ci-dessous)
  empêche d'oublier un modèle.
* Le numéro de révision et l'auteur viennent du contexte de la requête (identité authentifiée de la dépendance de sécurité), jamais d'un paramètre du client.
  Les tâches planifiées et les migrations s'identifient par un acteur système nommé.
* Le format des tables `*_aud` reste celui de V1 à V44 (colonnes de révision et type d'opération), afin de ne pas perdre l'historique ; tout changement de ce format est
  une décision à faire valider.

## Interdits

* `update()`/`delete()` ORM en masse et SQL brut sur une entité auditée : ils contournent l'écouteur. Charger, modifier, laisser la session vider.
* Modifier ou supprimer une ligne d'audit depuis l'application. Le compte d'exécution n'a pas ce droit en base (voir [persistance](./persistance.md)).
* Journaliser dans la trace un mot de passe, un jeton, une clé ou une donnée sensible non nécessaire : l'écouteur exclut explicitement ces colonnes.

## Actions auditées (hors données)

Les actions qui ne modifient pas une ligne auditée (connexion, échec, export, consultation sensible, appel d'outil MCP) sont tracées par un **décorateur ou une dépendance
d'action auditée** qui écrit un événement structuré dans la catégorie correspondante (voir [observabilité](./observabilite.md)), avec acteur, action, ressource,
résultat et identifiant de corrélation. Une action sans permission valide est elle aussi tracée comme refus.

## Tests

* Création, modification et suppression d'un modèle audité produisent chacune une ligne `*_aud` avec le bon type d'opération, le bon auteur et les valeurs avant/après.
* Un échec de validation ou une annulation de transaction ne laisse aucune ligne d'audit.
* **Test de couverture** : tout modèle persistant est soit audité, soit présent dans une liste blanche motivée (journaux, instantanés immuables).
* Une migration qui modifie des données auditées est testée sur PostgreSQL réel, lignes d'audit comprises.

## Choix des événements de session (documentation SQLAlchemy)

* `before_flush` : la session peut être manipulée en sécurité (ajouter, supprimer, modifier) et ces changements entrent dans le flush. Il sert à parcourir `session.new`,
  `session.dirty` et `session.deleted`, à lire l'état **avant** modification (historique d'attributs) et à ajouter les lignes d'audit des objets modifiés ou supprimés.
* Un objet nouveau n'a pas encore son identifiant généré par la base dans `before_flush`. Pour ses lignes d'audit, `after_flush` (SQL émis, collections `new/dirty/deleted`
  encore inspectables) écrit les lignes par insertion sur la connexion de la session. Les deux écouteurs sont enregistrés ensemble par un module unique de `platform/audit`.
* Le test « création → ligne d'audit avec la bonne clé » est obligatoire : il prouve ce choix sur PostgreSQL réel.
