---
title: "Auth — modèle et contrats"
sidebar_position: 2
---

Les routes et permissions sont décrites dans le [README](index.md) et le [catalogue d'accès](droits.md).
Les schémas sont des modèles Pydantic ; leurs noms de champs sont identiques dans le JSON et les modèles TypeScript.
Un identifiant est un entier long côté API et un `number` côté TypeScript. Les collections sont sérialisées
en tableaux ; les ensembles ne contiennent pas de doublon.

## Modèle de données

| Table | Champs principaux et contraintes | Liens |
|---|---|---|
| `utilisateur` | `id bigint` ; `version bigint` ; `username varchar(50)` et `email varchar(255)` obligatoires et uniques sans casse ; empreinte BCrypt obligatoire ; `actif boolean` ; compteurs et dates du verrouillage temporaire | Employé optionnel ; rôles et refus individuels par tables de liaison |
| `role` | `id bigint` ; `version bigint` ; `nom varchar(50)` obligatoire et unique sans casse ; `description varchar(255)` facultative | Permissions et utilisateurs par tables de liaison |
| `permission` | `id bigint` ; `version bigint` ; `code varchar(50)` obligatoire et unique ; `description varchar(255)` obligatoire | Catalogue versionné, consultable uniquement |
| `utilisateur_role`, `role_permission`, `utilisateur_permission_refusee` | Couples d'identifiants uniques, références existantes | Un refus individuel prime sur toutes les attributions par rôle |
| `refresh_token` | `id`, `version`, empreinte SHA-256 unique, expiration, famille de connexion, révocation et date de création | Utilisateur obligatoire ; jeton brut uniquement en cookie |
| `reset_password_token` | `id`, `version`, empreinte SHA-256 unique, expiration, utilisation et date de création | Utilisateur obligatoire ; secret à usage unique |

Les comptes, rôles, permissions et leurs liens sont audités. Les empreintes de mots de passe et l'état
opérationnel du verrouillage ne sont pas copiés dans l'historique ; les changements de credential et événements
de connexion disposent de traces de sécurité dédiées. Les jetons sont des données de session, jamais exposés
par les DTO d'administration. Une version périmée dans une modification refuse l'écriture avec `409`.

## Connexion et récupération

| DTO | Champ | Type | Contraintes et description |
|---|---|---|---|
| `LoginRequestDto` | `username`, `password` | `texte` | Obligatoires et non blancs ; identifiant normalisé à la recherche, mot de passe conservé tel que saisi |
| `ForgotPasswordRequestDto` | `email` | `texte` | Obligatoire, format courriel ; réponse générique `202` |
| `ResetPasswordRequestDto` | `token` | `texte` | Obligatoire, non blanc, valide, non expiré et non déjà utilisé |
| `ResetPasswordRequestDto`, `AdminResetPasswordRequestDto` | `nouveauMotDePasse` | `texte` | Obligatoire, 100 caractères au plus ; minimum administrable et différent de l'identifiant sans casse |
| `LoginResponseDto` | `accessToken` | `texte` | JWT d'accès ; conservé en mémoire par le frontend |
| `LoginResponseDto` | `utilisateur` | `UserResponseDto` | Profil et permissions effectives à l'émission du JWT |
| `PolitiqueMotDePasseDto` | `longueurMinimale` | `int` | Minimum courant entre 8 et 100 caractères ; la différence avec l'identifiant reste contrôlée au serveur |

Le rafraîchissement lit le cookie `httpOnly` et renvoie `LoginResponseDto` ainsi qu'un nouveau cookie.
Le jeton de rafraîchissement n'apparaît dans aucun corps JSON.

## Comptes : demandes

| DTO | Champ | Type | Contraintes et description |
|---|---|---|---|
| `UserCreateRequestDto` | `username` | `texte` | Obligatoire, 3 à 50 caractères après retrait des espaces extérieurs ; unique sans casse ; non modifiable ensuite |
| Création et `UserUpdateRequestDto` | `email` | `texte` | Obligatoire, format courriel, 255 caractères au plus après retrait des espaces extérieurs ; unique sans casse |
| Création | `motDePasse` | `texte` | Obligatoire, 100 caractères au plus et politique courante respectée |
| Modification | `version` | `entier` | Obligatoire ; version lue du compte |
| Modification | `actif` | `booléen` | État du compte ; une désactivation révoque ses sessions de rafraîchissement |
| Création et modification | `employeeId` | `entier` ou `null` | Lien optionnel vers un employé existant |
| Création et modification | `roleIds` | `ensemble d'entiers` | Ensemble obligatoire, éventuellement vide ; chaque identifiant est positif, non nul et existant |
| `DenyPermissionsRequestDto` | `version` | `entier` | Obligatoire ; version du compte après toute modification précédente |
| `DenyPermissionsRequestDto` | `permissionIds` | `ensemble d'entiers` | Remplacement complet des refus ; ensemble obligatoire, éventuellement vide ; identifiants positifs, non nuls et existants |
| `UtilisateurRecherche` | `username`, `email` | `texte` ou `null` | Recherche « contient », respectivement 50 et 255 caractères au plus ; vide ou absent = sans filtre |
| `UtilisateurRecherche` | `actif` | `booléen` ou `null` | Statut exact ; absent = tous les comptes |

Un compte est créé actif. La réinitialisation administrateur ne modifie ni ses rôles ni ses refus ; elle
révoque les sessions de rafraîchissement et laisse une trace de sécurité.

## Rôles : demandes

| DTO | Champ | Type | Contraintes et description |
|---|---|---|---|
| `RoleCreateRequestDto`, `RoleUpdateRequestDto` | `nom` | `texte` | Obligatoire, 2 à 50 caractères après retrait des espaces extérieurs ; unique sans casse |
| Création et modification | `description` | `texte` ou `null` | Facultative, 255 caractères au plus |
| Création et modification | `permissionIds` | `ensemble d'entiers` | Ensemble obligatoire, éventuellement vide ; identifiants positifs, non nuls et existants |
| Modification | `version` | `entier` | Obligatoire ; version lue du rôle |
| `RoleRecherche` | `nom`, `description` | `texte` ou `null` | Recherche « contient », respectivement 50 et 255 caractères au plus ; vide ou absent = sans filtre |

Le rôle d'administration protégé conserve son nom et ses permissions ; seule sa description se modifie.
La suppression d'un rôle attribué ou protégé répond `409`.

## Réponses d'administration

| DTO | Champs et types | Description |
|---|---|---|
| `UserResponseDto` | `id: entier`, `version: entier`, `username: texte`, `email: texte`, `actif: boolean` | Identité de connexion et état du compte |
| `UserResponseDto` | `employee: EmployeeSummaryDto` ou `null` | Employé lié : `id: entier`, `nomPrenom: texte`, `cin: texte` |
| `UserResponseDto` | `roles: ensemble de RoleSummaryDto` | Rôles attribués ; chaque résumé porte `id: entier` et `nom: texte` |
| `UserResponseDto` | `permissionsRefusees: ensemble de PermissionResponseDto` | Refus explicites du compte |
| `UserResponseDto` | `permissionsEffectives: ensemble de textes` | Union des codes des rôles moins les refus |
| `RoleResponseDto` | `id: entier`, `version: entier`, `nom: texte`, `description: texte` ou `null` | Rôle et description |
| `RoleResponseDto` | `permissions: ensemble de PermissionResponseDto`, `protege: boolean` | Catalogue attribué et protection du rôle d'administration |
| `PermissionResponseDto` | `id: entier`, `version: entier`, `code: texte`, `description: texte` | Permission du catalogue fixe |

Les recherches renvoient une page stable : `content` et `page { size, number, totalElements, totalPages }`.
La pagination et le tri se passent dans l'URL de l'API ; la taille est bornée à 200 enregistrements. Aucun
mot de passe, empreinte ou jeton de session n'est inclus dans ces réponses.
