# Autorisations — Heures supplémentaires

## Endpoints

| Endpoint | Permission |
|---|---|
| `POST /heures-supp/search`, `POST /heures-supp/analytique`, `GET /heures-supp/periodes` | `HEURES_SUP_READ` **et** `PAIE_READ` |
| `GET /heures-supp/import/prerequis` | `HEURES_SUP_IMPORT`, `PAIE_READ` et `CHANTIER_READ` |
| `GET /heures-supp/import/modele` | `HEURES_SUP_IMPORT` **et** `PAIE_READ` |
| `POST /heures-supp/import/analyse`, `POST /heures-supp/import`, `POST /heures-supp/import/remplacement` | `HEURES_SUP_IMPORT`, `PAIE_READ` et `EMPLOYEE_READ` |
| `POST /heures-supp/import/corrections` | `HEURES_SUP_IMPORT`, `PAIE_READ` et `EMPLOYEE_WRITE` |
| `heures_supp_periodes`, `heures_supp_indicateurs`, `heures_supp_rechercher` | `IA_UTILISER`, `HEURES_SUP_READ` et `PAIE_READ` |
| `heures_supp_import_prerequis` | `IA_UTILISER`, `HEURES_SUP_IMPORT`, `PAIE_READ` et `CHANTIER_READ` |

La lecture exige `PAIE_READ`, car les réponses exposent un taux horaire dérivé du salaire et des montants dus.
Le serveur revérifie chaque permission ; masquer un bouton Angular ne constitue pas un contrôle d'accès.

## Interface

- Le menu et les routes Tabulaire, Cartes et Analytique exigent `HEURES_SUP_READ` et `PAIE_READ`.
- L'importateur et le modèle Excel exigent `HEURES_SUP_IMPORT` et `PAIE_READ`.
- La création ou la correction d'une fiche employé depuis l'assistant exige aussi `EMPLOYEE_WRITE`.
- Les corrections suivent le même parcours explicite que l'import Paie ; sans `EMPLOYEE_WRITE`, l'utilisateur doit corriger la fiche avant de relancer l'analyse.

La migration `V40__permissions_heures_supp.sql` ajoute les deux permissions au rôle `SYSTEM_ADMIN` et au rôle
`PAIE_MANAGER`, conformément au seed des domaines métier. Les droits restent ensuite administrables dans l'écran Rôles.
