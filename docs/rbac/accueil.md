# RBAC — Accueil

| Endpoint | Permission | Usage |
|---|---|---|
| `GET /accueil` | `ACCUEIL_READ` | Lire son propre accueil et les indicateurs que ses permissions autorisent. |
| `PUT /accueil` · `DELETE /accueil` | `ACCUEIL_WRITE` | Choisir, ordonner ou rétablir ses propres indicateurs. |
| `GET /accueil/utilisateurs/{id}` | `ACCUEIL_ADMIN` | Lire l'accueil d'un autre utilisateur. |
| `PUT` · `DELETE /accueil/utilisateurs/{id}` | `ACCUEIL_ADMIN` | Régler ou rétablir l'accueil d'un autre utilisateur. |
| Outil MCP `accueil_lire` | `ACCUEIL_READ` | Rendre à l'assistant l'accueil de l'utilisateur pour qui il agit (lecture seule). |

| Élément frontend | Condition |
|---|---|
| Lien « Accueil » et route `/accueil` | `ACCUEIL_READ` |
| Écriture du choix (le serveur refuse sans elle) | `ACCUEIL_WRITE` |
| Action « Régler l'accueil » dans `/admin/users` | `ACCUEIL_ADMIN` |

Chaque indicateur reste protégé par la permission de lecture de son domaine (`PAIE_READ`, `EMPLOYEE_READ`) : un choix ne donne
jamais accès à une donnée que l'utilisateur ne pourrait pas lire ailleurs, et un indicateur dont la permission est retirée disparaît
de l'accueil. `V42__accueil_personnalise.sql` ajoute les trois permissions et les attribue à `SYSTEM_ADMIN` uniquement ; les autres
rôles les reçoivent depuis l'écran Rôles.
