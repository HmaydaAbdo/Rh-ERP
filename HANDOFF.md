# Handoff — conformité Staport ERP-RH

Mis à jour le 10 octobre 2026. Ce document est la reprise détaillée du chantier ; il doit être maintenu à chaque étape et rester franc sur les écarts ouverts.

## Objectif complet

Amener ERP-RH à **100 % de conformité** avec les conventions Staport versionnées et réutilisables par les projets actuels et futurs :
backend Spring/JDK supporté, architecture par domaine, sécurité, RBAC par domaine et audit ; PostgreSQL 18 avec pgvector et Flyway ;
Angular stable actuel (standalone, Signals, zoneless, lazy loading, UI/UX Staport, accessibilité, performance, sécurité) ; tests à tous les
niveaux ; documentation, skills et CI synchronisés ; migration sûre de la production PostgreSQL 17 → 18 ; BI/IA progressivement.
Aucun objectif n'est considéré terminé si un écart applicable reste ouvert sans décision explicite.

## Organisation du travail

Une seule branche, `main`, sans pull request : un commit par lot cohérent, poussé directement. Le CI (`.github/workflows/ci.yml`)
doit rester vert : backend (JDK 21, PostgreSQL 18), frontend (tests Vitest, audit, licences, SBOM, build, E2E, image Docker).

## Terminé

### Standards et documentation
- Socle Staport `v0.1.1` épinglé (`conventions/staport/`, `STAPORT_STANDARDS_VERSION`), ADR d'adoption, skills d'agents par domaine,
  conventions frontend/design système alignées sur Angular 22 + Aria/CDK + Tailwind + Lucide.
- Documentation frontend, tests, README et conventions synchronisés avec le kit Staport (2026-10-10).

### Backend et base
- Java 21 ; PostgreSQL 18.6 + pgvector 0.8.7, Flyway jusqu'à V15 ; copie locale migrée de PG17 vers PG18 (28 tables comparées) ;
  261 tests backend verts. La production reste en PG17 et n'a pas été touchée ; runbook dans `docs/deployment.md`.

### Frontend
- Angular 22.2.2, Node 24.15, TypeScript 6, build `@angular/build` ; **Zone.js, Karma, Jasmine, PrimeNG, PrimeIcons, PrimeFlex,
  AG Grid et @angular/animations retirés** ; tous les composants `OnPush` avec Signals.
- **Kit Staport** (`src/app/shared/ui/`, voir `docs/frontend/README.md`) : icônes Lucide, boutons, pastilles, dialogue/tiroir (CDK),
  menu et bouton scindé (Aria), select/multiselect (Aria combobox + listbox), tableau natif, champs nombre/mot de passe/date/mois, message,
  graphique Chart.js, catalogue `/catalogue` (développement). Tous les écrans (fonctions, équipes, chantiers, employés, utilisateurs,
  rôles, audit, paie) migrés ; `lazy-select`, `column-chooser`, `month-picker` réécrits.
- Bundle initial ~555 kB (780 avant), CSS global 25 kB (268 avant). Tailwind 4 câblé (utilitaires seulement, `tailwind.css`).
- Assistant d'export de la paie découpé (coque + `PaieExportStore` + un composant par étape) : plus de dépassement de budget de style. Nouvelle étape **Chantier** (PDF) : rapport limité à un chantier, case « Sans vue d'ensemble » ; backend : `PaieReportPdfRequestDto.sansVueEnsemble`, chapitres renumérotés à partir de I.
- Tests : **186 tests Vitest** dans Chromium réel (sans Zone.js) ; **31 parcours E2E Playwright + axe** (API simulée, thèmes clair/sombre,
  téléphone). Axe a fait corriger : repère `<main>`, toast en `div`, séparateur de colonne, contrastes. Bogue corrigé : notification
  « Erreur » affichée à un visiteur sans session (`auth/refresh` désormais silencieux).
- Chaîne d'approvisionnement : `npm audit` 0 vulnérabilité (tous niveaux, aucune exception : Karma n'est plus dans le verrou), licences contrôlées
  (`audit:licences`), SBOM CycloneDX en artefact CI.
- CI : Dockerfile frontend en Node 24.15 ; tests via `npm test` ; E2E via `npm run e2e`.

## Écarts ouverts (voir aussi TODO.md)

1. **Tests du kit et des écrans** : le kit n'a que les E2E du catalogue ; Employé, Chantier, Équipe, Utilisateurs, Rôles n'ont pas de tests de
   composants dédiés.
3. **Backend** : contrôle de conformité par domaine non fait (RBAC par domaine, audit, secrets, logs/métriques, erreurs).
4. **Production PG17 → PG18** : non exécutée ; à planifier avec sauvegarde, répétition, fenêtre de maintenance, retour arrière.
5. **Standards** : repinner une version suivante du snapshot Staport quand elle existe ; limite de débit sur `/auth/*` (audit sécurité n° 6).

## Commandes de reprise et validation

```bash
cd frontend            # Node 24.15 (voir .nvmrc)
npm ci
npm test               # Vitest, Chromium (CHROME_BIN si Chrome n'est pas détecté)
npm run e2e            # Playwright, serveur de dev sur le port 4300
npm run audit:deps && npm run audit:licences
npx ng build --configuration production
cd ../backend && ./mvnw test   # JDK 21 + PostgreSQL 18/pgvector accessibles
```

## Conditions de clôture

Clôturer seulement lorsque la matrice de conformité complète est renseignée et passée : pas de peer conflict, licence inconnue,
audit de vulnérabilités non traité, erreur de build, test exigé manquant, documentation divergente, migration de production non planifiée
ou exception implicite. Le choix métier externe restant (fenêtre réelle de migration de production) doit être confirmé par le propriétaire.
Ne pas toucher à la production ni supprimer le volume PostgreSQL 17 sans sauvegarde, répétition et plan de retour arrière.
