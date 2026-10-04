# Tests

> Ce qui est testé, comment lancer les tests, et les règles à suivre en écrivant un test. Les tests
> sont exécutés par la CI à chaque push et chaque pull request (`.github/workflows/ci.yml`) : un test qui
> échoue empêche la publication des images.

---

## Lancer les tests

```bash
# Backend — nécessite un PostgreSQL accessible (docker compose up -d postgres) et les variables de backend/.env
cd backend
./mvnw test

# Frontend
cd frontend
npx ng test --watch=false --browsers=ChromeHeadless
npx ng build --configuration production      # vérifie que le bundle de production compile
```

La CI utilise un PostgreSQL de service (`pgvector/pgvector:pg17`), des variables d'environnement factices
(`JWT_SECRET` de test, etc.) et installe une police système, nécessaire au rendu des graphiques SVG du rapport en
environnement sans écran.

---

## Backend (141 tests)

JUnit 5, Mockito, AssertJ. La plupart des tests sont **unitaires** : le service est testé avec ses dépendances
simulées, sans base de données. Seul `PaieApplicationTests` démarre l'application complète.

| Zone | Classes de test | Ce qu'elles vérifient |
|---|---|---|
| Démarrage | `PaieApplicationTests` | L'application démarre sur une **base vide** : toute la chaîne de migrations V1 → V10 est rejouée et validée contre les entités (`ddl-auto: validate`) |
| Sécurité des endpoints | `EndpointSecurityTest` | Découvre automatiquement tous les `@RestController` (sauf `AuthController`) : chaque endpoint déclare une permission, la **refuse** sans elle, l'**accepte** avec elle, refuse une autre permission du même domaine, et correspond à la **table de référence** (45 endpoints) |
| Chaîne JWT | `JwtSecurityChainTest` | De vrais jetons signés : `401` sans jeton, avec un jeton invalide ou signé avec un autre secret ; `403` sans la permission, même avec un rôle d'administrateur ; `200` avec |
| Permissions effectives | `EffectivePermissionResolverTest` | Union des rôles moins les refus individuels |
| Authentification | `AuthServiceTest` | Connexion (identifiants invalides, compte inactif ou inconnu), rotation, **réutilisation d'un jeton = révocation de la famille**, jeton expiré ou inconnu, déconnexion, mot de passe oublié (sans révéler l'existence d'un compte) et réinitialisation |
| Fonction | `FunctionServiceTest`, `FunctionImportServiceTest` | CRUD, doublons, suppression bloquée ; import atomique |
| Chantier | `ChantierServiceTest`, `ChantierSyncServiceTest`, `ChantierSyncTransactionalOperationsTest` | création et code en double ; synchronisation : création des absents, **jamais de modification** d'un existant, lignes sans code ignorées, isolation des échecs par ligne |
| Équipe | `EquipeServiceTest` | Normalisation du code, doublons, suppression bloquée |
| Employé | `EmployeeServiceTest`, `EmployeeControllerTest`, `EmployeeImportServiceTest` | CRUD et références ; contrôleur ; import (CIN existant rejeté, un seul motif par ligne, atomicité) |
| Paie | `PaieServiceTest`, `PaieAnalytiqueServiceTest`, `PaieImportServiceTest`, `PaieExportServiceTest` | CRUD, bulletin en double ; masse des équipes d'un chantier ; import (bulletin existant rejeté, création des fonctions manquantes, équipe) ; analytique (coût moyen, mois précédent absent sans bulletin, filtres vides ignorés, nom et CIN en motifs sans casse, tranches égales à dernière ouverte, nom du chantier, fenêtre de 12 mois) ; `FiltresPaieTest` (mêmes règles de filtre que la liste) ; export Excel (feuille globale et par chantier, tri par fonction puis nom, sorties STC, mois précédent, squelette matériel du chantier C168, sélection et exclusion d'équipes) |
| Rapport PDF | `PaieBiReportBuilderTest`, `RapportPageModelBuilderTest`, `RapportChartSvgBuilderTest`, `PaieReportHtmlPdfServiceTest` | Agrégation (tous les chantiers dans le graphique, sans « Autres », sections conservées) ; répartition du graphique sur plusieurs pages à tailles égales avec échelle commune ; graphique SVG **pleine largeur** (non-régression) ; génération d'un PDF valide, y compris une charge hostile jamais interprétée comme du balisage |

### Les deux tests de sécurité à connaître

- **Ajouter un endpoint** : `EndpointSecurityTest` échoue tant que la table `PERMISSIONS_ATTENDUES` ne contient
  pas la ligne correspondante. C'est voulu : il force à déclarer la permission **et** à documenter l'endpoint
  dans [rbac/](rbac/README.md) dans le même changement.
- **Affaiblir une permission** (par exemple remplacer `PAIE_DELETE` par `PAIE_READ`) fait échouer le test de la
  table de référence : la permission ne peut changer que volontairement.

---

## Frontend (26 tests)

Jasmine + Karma, Chrome headless.

| Fichier | Ce qu'il vérifie |
|---|---|
| `app.component.spec.ts` | Création de l'application, titre, pas de barre latérale sans connexion, barre latérale avec connexion |
| `shared/components/month-picker/month-picker.component.spec.ts` | Mois indisponibles grisés et non sélectionnables, émission au format `aaaa-MM`, bornes de navigation d'année, tous les mois autorisés sans liste |
| `portail/paie/export/paie-export-wizard.component.spec.ts` | Assistant d'export : dernier mois présélectionné, refus sans mois valide, chargement des chantiers, aucune équipe cochée d'office à l'activation d'un chantier, apparition de l'étape matériel (seulement C168 avec CH/OP), contenu des requêtes PDF et Excel, nombres invalides, colonne laissée vide, mémorisation des nombres |
| `portail/paie/cartes/paie-cartes.component.spec.ts` | Vue Cartes : mois sans chargement de chantiers, variation comparée au seul mois contigu, part des chantiers, recherche, ligne « Sans équipe » déduite (et absente sans bulletin sans équipe), clic sur une équipe vers la liste filtrée (rien pour « Sans équipe »), mois déjà chargé non rappelé, mois ou chantier introuvable, sens de la descente |
| `portail/paie/filtres/paie-filtres.spec.ts` | Filtres de la barre dans l'URL : lecture complète, valeurs invalides ignorées, paramètres vides retirés, aller-retour sans perte, critères d'API (undefined pour un filtre absent, mois facultatif) |
| `portail/paie/filtres/paie-filtres.component.spec.ts` | Barre de filtres : mois voisins et bornes, « Tous les mois », émission immédiate du mois, saisies émises une seule fois après le délai, réinitialisation complète |
| `portail/paie/vues/paie-vues.component.spec.ts` | Coque des vues : filtres lus dans l'URL, filtres de la barre écrits dans l'URL de la vue courante sans la changer, filtre vidé retiré, mois rechargés à chaque changement de vue |
| `portail/paie/list/paie-list.component.spec.ts` | Vue tabulaire : tous les filtres de l'URL transmis à la première recherche, valeurs invalides ignorées, relance en première page quand les filtres changent, rien quand l'URL change sans changer les filtres |
| `portail/paie/cartes/paie-cartes.component.spec.ts` | Vue Cartes : niveau déduit des filtres, filtres transmis à chaque niveau, variation comparée au seul mois contigu, tuiles et parts calculées sur les chantiers filtrés, ligne « Sans équipe » déduite (et absente sans bulletin sans équipe), clic sur une équipe vers la liste filtrée (rien pour « Sans équipe »), réponses gardées par filtres, absence de résultat, chantier introuvable, sens de la descente |
| `portail/paie/analytique/paie-analytique.component.spec.ts` | Vue Analytique : mois le plus récent ouvert sans mois dans l'URL (et jamais à la place de celui de l'URL), tous les filtres de l'URL transmis, variations (aucune sans mois précédent, pas de division par zéro), clic sur une barre = filtre chantier, filtre retiré de l'URL, évolution à partir de 3 mois, qualité des données, périmètre vide, aucune paie |
| `core/auth/guards/auth.guard.spec.ts` | `homeGuard` : premier écran autorisé, `/acces-refuse` sans aucune permission (**pas de boucle**), `/login` sans connexion ; `permissionGuard` : accès avec la permission, `/acces-refuse` sans |

Le reste de l'interface (écrans, formulaires, tableaux) n'a **pas** de test automatisé : il est vérifié à la main
dans le navigateur. C'est une limite connue. L'assistant d'export a, lui, été vérifié de bout en bout (backend sur une copie
de la base, génération réelle du PDF et de l'Excel, nombres du parc matériel relus dans les fichiers).

---

## Règles pour écrire un test

- Un test décrit un comportement métier, son nom est une phrase (`creerSiAbsent_neDoitJamaisModifierUnChantierExistant`).
- Tester le **comportement** (ce qui est enregistré ou renvoyé), pas l'implémentation interne.
- Toute règle métier tranchée avec la direction a son test (ex. « un import ne modifie jamais un existant »).
- Un bug corrigé reçoit un **test de non-régression** (ex. largeur du graphique du rapport).
- Une règle de sécurité (permission, jeton) est testée à travers la vraie chaîne quand c'est possible.
- Ne jamais dépendre de données de production : les tests créent leurs propres données ou simulent les
  dépendances.
- Après une modification : lancer les tests backend **et** le build du frontend avant de considérer la tâche
  terminée (`CLAUDE.md`).

## Ce qui n'est pas testé automatiquement

- Les écrans Angular (hors guards et coque de l'application).
- Le rendu visuel du rapport PDF : vérifié à la main (les tests contrôlent la structure et les nombres, pas
  l'apparence).
- La synchronisation avec l'ERP réel (le client HTTP est simulé).
- L'envoi réel de courriel.
