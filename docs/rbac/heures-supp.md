# Autorisations — Heures supplémentaires

## Endpoints

| Endpoint | Permission |
|---|---|
| `POST /heures-supp/search`, `GET /heures-supp/{id}`, `POST /heures-supp/analytique`, `GET /heures-supp/periodes` | `HEURES_SUP_READ` **et** `PAIE_READ` |
| `PUT /heures-supp/{id}` | `HEURES_SUP_IMPORT` et `PAIE_READ` |
| `POST /heures-supp` | `HEURES_SUP_IMPORT`, `PAIE_READ`, `EMPLOYEE_READ` et `CHANTIER_READ` |
| `DELETE /heures-supp/{id}` | `HEURES_SUP_DELETE` et `PAIE_READ` |
| `POST /heures-supp/suppression-mois` | `HEURES_SUP_PURGE` et `PAIE_READ` |
| `GET /heures-supp/import/prerequis` | `HEURES_SUP_IMPORT`, `PAIE_READ` et `CHANTIER_READ` |
| `GET /heures-supp/import/modele` | `HEURES_SUP_IMPORT` **et** `PAIE_READ` |
| `POST /heures-supp/import/analyse`, `POST /heures-supp/import`, `POST /heures-supp/import/remplacement` | `HEURES_SUP_IMPORT`, `PAIE_READ` et `EMPLOYEE_READ` |
| `POST /heures-supp/import/corrections` | `HEURES_SUP_IMPORT`, `PAIE_READ`, `EMPLOYEE_WRITE` et `FUNCTION_READ` |
| `heures_supp_periodes`, `heures_supp_indicateurs`, `heures_supp_rechercher` | `IA_UTILISER`, `HEURES_SUP_READ` et `PAIE_READ` |
| `heures_supp_import_prerequis` | `IA_UTILISER`, `HEURES_SUP_IMPORT`, `PAIE_READ` et `CHANTIER_READ` |

La lecture exige `PAIE_READ`, car les réponses exposent un taux horaire dérivé du salaire et des montants dus.
Le serveur revérifie chaque permission ; masquer un bouton Angular ne constitue pas un contrôle d'accès.

## Interface

- Le menu et les routes Tabulaire, Cartes et Analytique exigent `HEURES_SUP_READ` et `PAIE_READ`.
- L'importateur et le modèle Excel exigent `HEURES_SUP_IMPORT` et `PAIE_READ`.
- L'ajout depuis son écran dédié exige aussi `EMPLOYEE_READ` et `CHANTIER_READ` pour sélectionner les références ; la modification charge la ligne avec la permission de lecture.
- La création ou la correction d'une fiche employé depuis l'assistant exige aussi `EMPLOYEE_WRITE` et `FUNCTION_READ` pour choisir sa fonction.
- Les corrections suivent le même parcours explicite que l'import Paie ; sans `EMPLOYEE_WRITE`, l'utilisateur doit corriger la fiche avant de relancer l'analyse.

La migration `V40__permissions_heures_supp.sql` ajoute les permissions de lecture et d'import au rôle `SYSTEM_ADMIN` et au rôle
`PAIE_MANAGER`. La migration V41 ajoute les permissions distinctes de suppression unitaire et de purge mensuelle à ces rôles.
Les droits restent ensuite administrables dans l'écran Rôles.
