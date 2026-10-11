# RBAC — Paramètres

| Endpoint | Permission | Usage |
|---|---|---|
| `GET /parametres` | `PARAMETRE_READ` | Lire le catalogue fixe, ses métadonnées et les valeurs courantes. |
| `PUT /parametres/{id}` | `PARAMETRE_WRITE` | Modifier la valeur d'un paramètre existant. |

| Élément frontend | Condition |
|---|---|
| Lien « Paramètres » et route `/admin/parametres` | `PARAMETRE_READ` |
| Champs modifiables et boutons « Enregistrer » | `PARAMETRE_WRITE` |

`V16__parametres_administrables.sql` ajoute ces permissions au catalogue et les attribue à `SYSTEM_ADMIN` uniquement. Un rôle
qui doit aussi régler les paramètres doit recevoir les permissions correspondantes depuis l'écran Rôles.

Les modifications passent par l'audit métier commun (`PARAMETRE_MODIFICATION`) et le journal append-only. L'endpoint public
`GET /auth/password-policy` ne renvoie que la longueur minimale du mot de passe nécessaire à l'écran de réinitialisation ; il
ne révèle aucune valeur administrative et ne demande aucune permission.
