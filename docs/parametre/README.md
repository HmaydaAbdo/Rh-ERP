# Paramètres de fonctionnement

> Valeurs de fonctionnement administrables depuis le portail. Les clés, types et bornes sont fixes dans le code ; leur valeur
> courante est stockée dans la table `parametre` et modifiée depuis l'écran, jamais par une clé libre saisie par l'utilisateur.

## Paramètres disponibles

| Clé | Valeur initiale V16 | Règle |
|---|---:|---|
| `securite.jeton-acces.minutes` | 15 minutes | Durée d'un Access Token JWT ; de 1 à 1 440 minutes. Un jeton déjà émis garde son expiration. |
| `securite.jeton-session.heures` | 12 heures | Durée du cookie de session. Le changement s'applique aux sessions émises après la modification. |
| `securite.lien-reinitialisation.minutes` | 60 minutes | Validité d'un lien de réinitialisation à usage unique ; de 5 à 1 440 minutes. |
| `securite.mot-de-passe.longueur-minimale` | 10 caractères | Minimum à la création et lors des réinitialisations ; de 8 à 100. Les mots de passe existants ne changent pas. |
| `paie.analytique.pas-tranche` | 500 DH | Pas et largeur minimale des tranches de répartition des salaires ; de 1 à 100 000 DH. |
| `chantier.synchronisation.cron` | `0 0 23 * * *` | Cron Spring à six champs, secondes comprises ; planifie la synchronisation quotidienne à 23 h. |

La définition complète (libellé, description, type et bornes) appartient à `CleParametre`. Une valeur entière est normalisée
et bornée côté serveur. Une expression cron est validée par Spring. Une valeur invalide répond `400` et n'est pas enregistrée.

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
