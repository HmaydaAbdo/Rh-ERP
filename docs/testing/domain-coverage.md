# Couverture obligatoire par domaine

Les seuils backend sont calculés sur `jacoco.xml` après `./mvnw -B test`. Ils agrègent les packages
propriétaires de chaque domaine. Le frontend instrumente `src/app/**/*.ts`, produit `coverage/frontend/lcov.info`
et applique les mêmes seuils de lignes/branches à chaque domaine dans la CI. Un chemin frontend non
classé bloque la porte pour éviter qu'un nouveau domaine échappe au contrôle.

| Domaine | Backend lignes | Backend branches | Frontend lignes | Frontend branches | Test backend ciblé | Parcours full stack |
|---|---:|---:|---:|---:|---|---|
| Authentification / administration | 70 % | 50 % | 70 % | 50 % | `./mvnw -Dtest=staport.rh.auth.** test` | connexion + écrans administration |
| Employé | 70 % | 50 % | 70 % | 50 % | `./mvnw -Dtest=staport.rh.employee.** test` | liste Employés |
| Fonction | 70 % | 50 % | 70 % | 50 % | `./mvnw -Dtest=staport.rh.function.** test` | liste Fonctions |
| Chantier | 70 % | 25 % | 70 % | 50 % | `./mvnw -Dtest=staport.rh.chantier.** test` | liste Chantiers |
| Équipe | 70 % | 25 % | 70 % | 50 % | `./mvnw -Dtest=staport.rh.equipe.** test` | liste Équipes |
| Paie | 70 % | 70 % | 70 % | 50 % | `./mvnw -Dtest=staport.rh.paie.** test` | liste Paie |
| Heures supplémentaires | 70 % | 50 % | 70 % | 50 % | `./mvnw -Dtest=staport.rh.heuresupp.** test` | assistant mensuel par chantier, récapitulatif et vues partagées |
| Paramètres | 70 % | 70 % | 70 % | 50 % | `./mvnw -Dtest=staport.rh.parametre.** test` | `/admin/parametres` |
| Audit | 70 % | 60 % | 70 % | 50 % | `./mvnw -Dtest=staport.rh.audit.** test` | `/audit` |
| Composants partagés | — | — | 70 % | 50 % | — | Parcours consommateurs concernés |
| Socle frontend (`core` et coque) | — | — | 70 % | 50 % | — | Authentification et navigation |

`scripts/check-domain-coverage.mjs` agrège JaCoCo ; `scripts/check-frontend-domain-coverage.mjs`
agrège LCOV. Chaque script échoue si une mesure applicable est sous son seuil. Si un groupe frontend
ne contient aucune branche, son seuil de branches est non applicable. Les rapports backend HTML/XML
et frontend HTML/LCOV sont conservés comme artefacts CI.

Le frontend exécute les tests Vitest instrumentés par `npm run test:coverage`; la CI applique ensuite
les seuils LCOV. Les E2E rapides utilisent l'API simulée pour les états d'interface ; le job `full-stack`
utilise le même navigateur contre le frontend Angular, l'API Spring et PostgreSQL.
Chaque ajout d'écran doit mettre à jour le tableau domaine → parcours → commande de ce document.
