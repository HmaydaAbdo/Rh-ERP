# Auth — modèle et contrats

Les routes et permissions sont décrites dans le [README](README.md) et le [catalogue d'accès](../rbac/auth.md).
Les DTO sont des records Java ; leurs noms de champs sont identiques dans le JSON et les modèles TypeScript.
Un identifiant est un entier `Long` côté Java et un `number` côté TypeScript. Les collections sont sérialisées
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
opérationnel du verrouillage ne sont pas copiés dans Envers ; les changements de credential et événements
de connexion disposent de traces de sécurité dédiées. Les jetons sont des données de session, jamais exposés
par les DTO d'administration. Une version périmée dans une modification refuse l'écriture avec `409`.

## Connexion et récupération

| DTO | Champ | Type | Contraintes et description |
|---|---|---|---|
| `LoginRequestDto` | `username`, `password` | `String` | Obligatoires et non blancs ; identifiant normalisé à la recherche, mot de passe conservé tel que saisi |
| `ForgotPasswordRequestDto` | `email` | `String` | Obligatoire, format courriel ; réponse générique `202` |
| `ResetPasswordRequestDto` | `token` | `String` | Obligatoire, non blanc, valide, non expiré et non déjà utilisé |
| `ResetPasswordRequestDto`, `AdminResetPasswordRequestDto` | `nouveauMotDePasse` | `String` | Obligatoire, 100 caractères au plus ; minimum administrable et différent de l'identifiant sans casse |
| `LoginResponseDto` | `accessToken` | `String` | JWT d'accès ; conservé en mémoire par le frontend |
| `LoginResponseDto` | `utilisateur` | `UserResponseDto` | Profil et permissions effectives à l'émission du JWT |
| `PolitiqueMotDePasseDto` | `longueurMinimale` | `int` | Minimum courant entre 8 et 100 caractères ; la différence avec l'identifiant reste contrôlée au serveur |

Le rafraîchissement lit le cookie `httpOnly` et renvoie `LoginResponseDto` ainsi qu'un nouveau cookie.
Le jeton de rafraîchissement n'apparaît dans aucun corps JSON.

## Comptes : demandes

| DTO | Champ | Type | Contraintes et description |
|---|---|---|---|
| `UserCreateRequestDto` | `username` | `String` | Obligatoire, 3 à 50 caractères après retrait des espaces extérieurs ; unique sans casse ; non modifiable ensuite |
| Création et `UserUpdateRequestDto` | `email` | `String` | Obligatoire, format courriel, 255 caractères au plus après retrait des espaces extérieurs ; unique sans casse |
| Création | `motDePasse` | `String` | Obligatoire, 100 caractères au plus et politique courante respectée |
| Modification | `version` | `Long` | Obligatoire ; version lue du compte |
| Modification | `actif` | `boolean` | État du compte ; une désactivation révoque ses sessions de rafraîchissement |
| Création et modification | `employeeId` | `Long` ou `null` | Lien optionnel vers un employé existant |
| Création et modification | `roleIds` | `Set<Long>` | Ensemble obligatoire, éventuellement vide ; chaque identifiant est positif, non nul et existant |
| `DenyPermissionsRequestDto` | `version` | `Long` | Obligatoire ; version du compte après toute modification précédente |
| `DenyPermissionsRequestDto` | `permissionIds` | `Set<Long>` | Remplacement complet des refus ; ensemble obligatoire, éventuellement vide ; identifiants positifs, non nuls et existants |
| `UserSearchCriteria` | `username`, `email` | `String` ou `null` | Recherche « contient », respectivement 50 et 255 caractères au plus ; vide ou absent = sans filtre |
| `UserSearchCriteria` | `actif` | `Boolean` ou `null` | Statut exact ; absent = tous les comptes |

Un compte est créé actif. La réinitialisation administrateur ne modifie ni ses rôles ni ses refus ; elle
révoque les sessions de rafraîchissement et laisse une trace de sécurité.

## Rôles : demandes

| DTO | Champ | Type | Contraintes et description |
|---|---|---|---|
| `RoleCreateRequestDto`, `RoleUpdateRequestDto` | `nom` | `String` | Obligatoire, 2 à 50 caractères après retrait des espaces extérieurs ; unique sans casse |
| Création et modification | `description` | `String` ou `null` | Facultative, 255 caractères au plus |
| Création et modification | `permissionIds` | `Set<Long>` | Ensemble obligatoire, éventuellement vide ; identifiants positifs, non nuls et existants |
| Modification | `version` | `Long` | Obligatoire ; version lue du rôle |
| `RoleSearchCriteria` | `nom`, `description` | `String` ou `null` | Recherche « contient », respectivement 50 et 255 caractères au plus ; vide ou absent = sans filtre |

Le rôle d'administration protégé conserve son nom et ses permissions ; seule sa description se modifie.
La suppression d'un rôle attribué ou protégé répond `409`.

## Réponses d'administration

| DTO | Champs et types | Description |
|---|---|---|
| `UserResponseDto` | `id: Long`, `version: Long`, `username: String`, `email: String`, `actif: boolean` | Identité de connexion et état du compte |
| `UserResponseDto` | `employee: EmployeeSummaryDto` ou `null` | Employé lié : `id: Long`, `nomPrenom: String`, `cin: String` |
| `UserResponseDto` | `roles: Set<RoleSummaryDto>` | Rôles attribués ; chaque résumé porte `id: Long` et `nom: String` |
| `UserResponseDto` | `permissionsRefusees: Set<PermissionResponseDto>` | Refus explicites du compte |
| `UserResponseDto` | `permissionsEffectives: Set<String>` | Union des codes des rôles moins les refus |
| `RoleResponseDto` | `id: Long`, `version: Long`, `nom: String`, `description: String` ou `null` | Rôle et description |
| `RoleResponseDto` | `permissions: Set<PermissionResponseDto>`, `protege: boolean` | Catalogue attribué et protection du rôle d'administration |
| `PermissionResponseDto` | `id: Long`, `version: Long`, `code: String`, `description: String` | Permission du catalogue fixe |

Les recherches renvoient une page stable : `content` et `page { size, number, totalElements, totalPages }`.
La pagination et le tri se passent dans l'URL de l'API ; la taille est bornée à 200 enregistrements. Aucun
mot de passe, empreinte ou jeton de session n'est inclus dans ces réponses.
