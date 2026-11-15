---
title: "Audit — modèle et contrats"
sidebar_position: 2
---

Les règles de traçabilité, de conservation et de consultation sont centralisées dans le
[README Audit](index.md). Toutes les routes de ce domaine demandent `AUDIT_READ`.

## Modèle

| Stockage | Contenu et contraintes |
|---|---|
| `audit_journal` | Identifiant `bigint` ; horodatage UTC ; catégorie, action, résultat, nom figé de l'acteur et origine obligatoires ; contexte, cible et périmètre facultatifs selon l'action. Entrées immuables pour l'application. |
| `audit_revision` | Identifiant `bigint` ; horodatage UTC ; nom figé et origine obligatoires ; identifiant d'acteur, de requête et adresse IP facultatifs. Une révision accompagne une transaction qui modifie une entité auditée. |
| `audit_revision_entite` | Types d'entités modifiés par une révision ; référence à `audit_revision`. |
| Tables `*_aud` | Identifiant de l'entité et révision forment la clé ; type d'ajout, modification ou suppression et instantané des colonnes auditées. Les références historiques ne dépendent pas de l'existence actuelle d'une ligne métier. |
| Chaîne locale du journal | `hash_precedent` et `hash_entree` gardent les empreintes SHA-256. Elles sont vérifiées dans PostgreSQL et ne sont pas exposées comme des champs métier modifiables. |

Le journal conserve les tentatives échouées et refusées selon le mécanisme documenté. Les secrets,
mots de passe et jetons sont exclus des traces. Une restauration de données ne réécrit jamais son entrée source.

## Recherche : `RechercheJournal`

Tous les critères sont facultatifs. Les dimensions différentes se combinent par intersection. Dans
une dimension multiple, une valeur parmi la sélection suffit ; une propriété singulière fournie en
même temps rejoint cette sélection. Les chaînes vides ou absentes ne filtrent pas.

| Champ | Type / JSON | Contraintes et sens |
|---|---|---|
| `dateDebut`, `dateFin` | `horodatage` / chaîne ISO 8601 | Bornes inclusives sur l'horodatage ; l'écran couvre du premier au dernier instant des jours saisis |
| `utilisateur` | `texte` | 100 caractères au plus ; recherche « contient » insensible à la casse sur le nom figé ; `%`, `_` et l'échappement sont du texte littéral |
| `categorie` | `CategorieAudit` | `OPERATION`, `SECURITE` ou `ACCES` ; critère singulier compatible avec les clients existants |
| `categories` | `liste de CategorieAudit` | 500 valeurs au plus, aucune `null` |
| `action`, `entiteType` | `texte` | 100 caractères au plus ; égalité sur le code d'action ou le type d'entité |
| `actions`, `entiteTypes` | `liste de textes` | 500 valeurs au plus ; chaque valeur non blanche et de 100 caractères au plus |
| `resultat` | `ResultatAudit` | `SUCCES` ou `ECHEC` |
| `entiteId` | `entier` / nombre | Identifiant exact de la ressource ciblée |
| `requestId` | `texte` | 100 caractères au plus ; égalité après retrait des espaces extérieurs |

Les paramètres de pagination sont `page`, `size` et `sort` ; la taille est bornée à 200. Les recherches,
différences et historiques renvoient `content` et `page { size, number, totalElements, totalPages }`.
L'historique est ordonné de la version la plus récente à la plus ancienne.

## Ligne et entrée du journal

`AuditJournalLigneDto` sert à la liste. `AuditJournalDto` reprend les mêmes informations et ajoute le
contexte détaillé chargé à l'ouverture de l'entrée.

| Champ commun | Type | Description et nullabilité |
|---|---|---|
| `id` | `entier` | Identifiant de l'entrée |
| `horodatage` | `horodatage` | Instant UTC ; affiché à l'heure de Casablanca |
| `categorie` | `CategorieAudit` | `OPERATION`, `SECURITE` ou `ACCES` |
| `action` | `texte` | Code stable du catalogue d'actions ; libellé fourni par l'interface |
| `typeOperation` | `TypeOperation` ou `null` | `CREATE`, `UPDATE` ou `DELETE` pour une écriture ; absent sinon |
| `resultat` | `ResultatAudit` | `SUCCES` ou `ECHEC` |
| `utilisateurId` | `entier` ou `null` | Compte identifié, sans imposer qu'il existe encore |
| `utilisateurNom` | `texte` | Identité figée de l'acteur ; une action système ou anonyme garde sa désignation explicite |
| `origine` | `Origine` | `API`, `TACHE_PLANIFIEE`, `DEMARRAGE`, `MIGRATION` ou `INCONNUE` |
| `entiteType`, `entiteId` | `texte`, `entier` ou `null` | Ressource visée lorsqu'elle est identifiée |
| `nombreElements` | `entier` ou `null` | Taille du périmètre d'une opération collective |
| `motif` | `texte` ou `null` | Motif lisible ou catégorie du refus/échec |

| Champ détaillé de `AuditJournalDto` | Type | Description |
|---|---|---|
| `requestId` | `texte` ou `null` | Relie les étapes d'une même requête |
| `adresseIp`, `userAgent` | `texte` ou `null` | Contexte d'origine utile à l'investigation |
| `perimetre` | `Map<String, Object>` ou `null` | Période, route, nombre ou autres éléments non secrets propres à l'action ; les champs ne sont pas inventés lorsqu'ils sont absents |
| `revisionId` | `entier` ou `null` | Révision d'historique de l'opération lorsqu'elle existe |

Les données personnelles et montants conservés dans les versions restent réservés à la permission d'audit.
La lecture d'une entrée ne rend aucune écriture du journal disponible.

## Différences et historique

| DTO | Champs et types | Sens |
|---|---|---|
| `AuditChampDto` | `champ: texte` | Nom du champ audité, traduit par l'interface |
| `AuditChampDto` | `avant`, `apres: texte` ou `null` | Valeurs déjà formatées ; une relation porte identifiant et libellé ; la valeur absente reste `null` |
| `AuditChampDto` | `ajoutes`, `retires: liste de textes` ou `null` | Éléments ajoutés ou retirés pour une collection de droits, à la place d'une valeur scalaire avant/après |
| `AuditChangementDto` | `entiteType: texte`, `entiteId: entier`, `libelle: texte` ou `null` | Enregistrement touché par la révision |
| `AuditChangementDto` | `operation: texte`, `champs: liste de AuditChampDto` | `AJOUT`, `MODIFICATION` ou `SUPPRESSION`, puis différences visibles |
| `AuditVersionDto` | `revision: entier`, `horodatage: Instant` | Identifiant et instant de la version |
| `AuditVersionDto` | `utilisateurId: entier` ou `null`, `utilisateurNom: texte`, `origine: Origine`, `requestId: texte` ou `null` | Auteur et contexte figés de la version |
| `AuditVersionDto` | `operation: texte`, `champs: liste de AuditChampDto` | Nature du changement et différences avec la version précédente |

Les réponses peuvent être vides si aucun changement ou aucune version n'existe. Une erreur de lecture
n'est pas un résultat vide : elle est annoncée et peut être réessayée. `404` signale une entrée ou un type
d'entité inconnu ; `400` une requête invalide ; `401`/`403` un accès non autorisé. L'historique est résolu
parmi les entités réellement auditées, avec un nom insensible à la casse.

L'instantané de restauration est un contrat interne de façade Audit → Paie, pas une réponse de ces routes.
Il transmet l'ancien identifiant, les références, la période et les valeurs d'un bulletin supprimé. Le
[domaine Paie](../paie/index.md) vérifie les références et conflits avant toute recréation atomique.
