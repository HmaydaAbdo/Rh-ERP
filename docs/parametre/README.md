# Paramètres de fonctionnement

> Valeurs de fonctionnement administrables depuis le portail. Les clés, types et bornes sont fixes dans le code ; leur valeur
> courante est stockée dans la table `parametre` et modifiée depuis l'écran, jamais par une clé libre saisie par l'utilisateur.

## Rôle et modèle

Le domaine fournit les valeurs de fonctionnement à l'authentification, à l'analytique Paie et à la
planification de synchronisation des chantiers. Il ne présente aucun indicateur de paie, import, export,
vue Cartes ou vue Analytique propre.

| Champ de `parametre` | Type | Contraintes et rôle |
|---|---|---|
| `id` | `bigint` | Identifiant technique généré |
| `version` | `bigint` | Version optimiste ; obligatoire à la modification |
| `cle` | `varchar(100)` | Obligatoire et unique ; clé du catalogue fixe, non modifiable |
| `valeur` | `varchar(255)` | Obligatoire ; texte validé et normalisé selon sa clé |

Les métadonnées de saisie proviennent de `CleParametre`, pas de champs administrables. Une clé du
catalogue absente de la base est une installation incomplète ; aucune valeur de repli ne masque ce cas.
Le backend garde les valeurs en mémoire sur son instance et les invalide après validation de la transaction.

## Paramètres disponibles

| Clé | Valeur initiale | Règle |
|---|---:|---|
| `securite.jeton-acces.minutes` | 15 minutes | Durée d'un Access Token JWT ; de 1 à 1 440 minutes. Un jeton déjà émis garde son expiration. |
| `securite.jeton-session.heures` | 12 heures | Durée du cookie de session ; de 1 à 720 heures. Le changement s'applique aux sessions émises après la modification. |
| `securite.lien-reinitialisation.minutes` | 60 minutes | Validité d'un lien de réinitialisation à usage unique ; de 5 à 1 440 minutes. |
| `securite.mot-de-passe.longueur-minimale` | 10 caractères | Minimum à la création et lors des réinitialisations ; de 8 à 100. Les mots de passe existants ne changent pas. |
| `paie.analytique.pas-tranche` | 500 DH | Pas et largeur minimale des tranches de répartition des salaires ; de 1 à 100 000 DH. |
| `chantier.synchronisation.cron` | `0 0 23 * * *` | Cron Spring à six champs, secondes comprises ; planifie la synchronisation quotidienne à 23 h. |

La définition complète (libellé, description, type et bornes) appartient à `CleParametre`. Une valeur entière est normalisée
et bornée côté serveur. Une expression cron est validée par Spring. Une valeur invalide répond `400` et n'est pas enregistrée.

La saisie entière utilise des chiffres décimaux et un signe éventuel. La notation exponentielle (`1e2`),
hexadécimale (`0x10`) ou une valeur composée seulement d'espaces est refusée, y compris à l'écran.

## Contrats DTO

| DTO et champ | Type | Contraintes et description |
|---|---|---|
| `ParametreResponseDto.id` | `Long` | Identifiant du paramètre |
| `version` | `Long` | Version courante à renvoyer lors de l'enregistrement |
| `cle` | `String` | Clé connue du catalogue |
| `libelle`, `description` | `String` | Nom et explication métier de la valeur |
| `type` | `TypeParametre` | `ENTIER` ou `CRON` |
| `unite` | `String` ou `null` | Minutes, heures, caractères ou DH ; absente pour un cron |
| `minimum`, `maximum` | `Long` ou `null` | Bornes inclusives des entiers ; absentes pour un cron |
| `valeur` | `String` | Valeur courante normalisée |
| `ParametreUpdateRequestDto.version` | `Long` | Obligatoire ; version courante issue de la lecture |
| `ParametreUpdateRequestDto.valeur` | `String` | Obligatoire, non blanche et au plus 255 caractères ; type et bornes vérifiés par le serveur |

Le frontend utilise `number` pour les identifiants, la version et les bornes, et les mêmes noms de champs.
Une modification retourne le DTO complet actualisé. Codes d'erreur : `400` pour une valeur invalide,
`404` pour un identifiant inconnu, `409` pour une version périmée, `401`/`403` pour un accès non autorisé.

## API et autorisations

| Méthode | Route | Permission | Rôle |
|---|---|---|---|
| `GET` | `/parametres` | `PARAMETRE_READ` | Liste le catalogue avec les valeurs et métadonnées de saisie. |
| `PUT` | `/parametres/{id}` | `PARAMETRE_WRITE` | Modifie la valeur d'une clé connue. |

Le catalogue ne permet ni création, ni suppression, ni renommage de clé depuis l'interface. Les données sont validées à nouveau
par le backend, même quand le frontend indique les bornes. Seul `SYSTEM_ADMIN` reçoit ces deux permissions à l'installation ;
leur attribution reste ensuite administrable depuis l'écran Rôles.

## Audit et persistance

`parametre` est audité par Envers. Chaque modification passe par `@AuditableAction` : valeur et révision sont atomiques et une
entrée `PARAMETRE_MODIFICATION` est ajoutée au journal. La migration `V16__parametres_administrables.sql` crée la table et sa
table `parametre_aud`, écrit la révision de migration et journalise les valeurs et permissions initiales. Le compte applicatif
ne peut ni modifier ni supprimer l'historique.

## Frontend

L'écran `/admin/parametres` est visible avec `PARAMETRE_READ`. Les champs et boutons de sauvegarde ne sont modifiables qu'avec
`PARAMETRE_WRITE`. Les valeurs et les métadonnées sont chargées depuis `GET /parametres`; chaque ligne est enregistrée
indépendamment par `PUT /parametres/{id}`. Les erreurs de validation serveur sont affichées par l'intercepteur HTTP commun.

La règle des mots de passe destinée aux formulaires sans session est lue par `GET /auth/password-policy` (endpoint public) ;
le backend demeure l'autorité de validation.

Le chargement est annoncé. Une lecture échouée affiche une erreur et un bouton de réessai ; une liste
réellement vide a son propre état. Un enregistrement réussi actualise la valeur et la version de la ligne,
sans effacer les saisies des autres paramètres. Le champ reçoit le focus quand sa validation refuse la soumission.

## Scénarios de contrôle

| Scénario | Preuve exécutable |
|---|---|
| Type, bornes inclusives, normalisation et expression cron invalide | `CleParametreTest` |
| Catalogue, modification lue aussitôt, validation refusée et trace d'audit | `ParametreServiceTest` |
| Lecture seule, chargement, erreur et réessai | `parametre-list.component.spec.ts` |
| Entier hors bornes, notation refusée, valeur blanche et sauvegarde avec version | `parametre-item.component.spec.ts` |
| Routes refusées sans permission et accessibles avec le droit requis | `EndpointSecurityTest` |

Les durées et seuils sont ceux du catalogue présenté ci-dessus. Leur adaptation métier se fait par
l'écran ; ajouter une nouvelle clé demande sa définition, sa valeur initiale et ses usages documentés.
