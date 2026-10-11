# Couverture obligatoire par domaine

La porte backend est calculée sur `jacoco.xml` après `./mvnw -B test`. Elle agrège les packages
propriétaires de chaque domaine et bloque la CI si l'un des seuils suivants n'est pas atteint :

| Domaine | Lignes | Branches | Test rapide | Parcours full stack |
|---|---:|---:|---|---|
| Authentification / administration | 70 % | 50 % | `./mvnw -Dtest=staport.rh.auth.** test` | connexion + écrans administration |
| Employé | 70 % | 50 % | `./mvnw -Dtest=staport.rh.employee.** test` | liste Employés |
| Fonction | 70 % | 50 % | `./mvnw -Dtest=staport.rh.function.** test` | liste Fonctions |
| Chantier | 70 % | 25 % | `./mvnw -Dtest=staport.rh.chantier.** test` | liste Chantiers |
| Équipe | 70 % | 25 % | `./mvnw -Dtest=staport.rh.equipe.** test` | liste Équipes |
| Paie | 70 % | 70 % | `./mvnw -Dtest=staport.rh.paie.** test` | liste Paie |
| Paramètres | 70 % | 70 % | `./mvnw -Dtest=staport.rh.parametre.** test` | `/admin/parametres` |
| Audit | 70 % | 60 % | `./mvnw -Dtest=staport.rh.audit.** test` | `/audit` |

Le script `scripts/check-domain-coverage.mjs` agrège le rapport JaCoCo et échoue dès qu'un domaine
passe sous son seuil. Le rapport HTML et XML reste conservé comme artefact CI.

Le frontend exécute les tests Vitest avec instrumentation (`npm run test:coverage`) et conserve
`frontend/coverage` comme artefact. Les E2E rapides utilisent l'API simulée pour les états d'interface;
le job `full-stack` utilise le même navigateur contre le frontend Angular, l'API Spring et PostgreSQL.
Chaque ajout d'écran doit mettre à jour le tableau domaine → parcours → commande de ce document.
