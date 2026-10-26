---
name: erp-rh-auth-rbac
description: Use when changing authentication, sessions, accounts, roles, permissions, or authorization tests in ERP-RH.
---

# Skill — domaine Auth et RBAC

## Lire avant d'agir

- [README Auth](../README.md)
- [Permissions Auth](../../rbac/auth.md) et [catalogue RBAC](../../rbac/README.md)
- [README Audit](../../audit/README.md)
- `conventions/security.md`

## Garde-fous

- Catalogue de permissions versionné par migration ; rôles administrables ; refus individuel
  prioritaire sur les rôles, selon la documentation.
- Vérifier chaque route côté serveur. Guards et masquage UI améliorent le parcours mais ne sont pas
  des contrôles de sécurité.
- Ne baser aucune règle métier sur un nom de rôle ; ne pas exposer secrets, tokens ou mots de passe.
- Toute modification met à jour les tableaux endpoint → permission et la table de référence des
  tests de sécurité dans le même changement.
- Les événements de connexion, refus et changements de droits respectent le journal d'audit.
- Les lectures de rôles et le catalogue sont accessibles à `USER_MANAGE` pour l'édition des comptes ;
  créer, modifier et supprimer un rôle reste réservé à `ROLE_MANAGE`.
- Le lien Employé se sélectionne avec `EMPLOYEE_READ` ; sans ce droit, conserver sa valeur courante
  sans interroger le référentiel. Ne pas effacer ce lien lors de l'enregistrement du compte.
- Charger le compte, ses rôles et le catalogue avant d'exposer un formulaire enregistrable ;
  distinguer erreur, chargement et vide. Un échec de la seconde écriture des refus conserve la version
  renvoyée par la première et annonce l'enregistrement partiel.
- Vérifier les types et contraintes dans [les contrats](../contrats.md), notamment les tailles après
  normalisation et les identifiants positifs non nuls des ensembles.

## Vérification

Tester non authentifié, authentifié sans permission, permission effective, refus individuel,
rotation/révocation de session et événements d'audit ; garder les tests JWT de chaîne complète.
Les formulaires et listes vérifient aussi réponses tardives, erreur/réessai, sélection partielle,
pagination et sauvegarde partielle des refus. `AuthRequestValidationTest` couvre les entrées HTTP.
