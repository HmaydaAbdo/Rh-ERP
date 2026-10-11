# Staport Engineering Standards

**Version:** 0.1.1 · **Statut:** en cours de consolidation dans `conventions/` · **Langue normative:** français

Socle commun pour les applications Staport, les agents de développement et les nouveaux projets.
Il fixe les règles transverses ; chaque application garde son domaine métier, ses parcours, ses
permissions concrètes, ses mesures BI et ses décisions locales.

Les aspects déjà fusionnés et relus dans les conventions à la racine sont retirés progressivement
de ce dossier. Pour ces aspects, les fichiers de `conventions/` font foi.

## Décisions déjà retenues

- Chaque application garde ses skills métier dans ses propres domaines. Le dossier `domains/` du
  squelette est intentionnellement vide.

## Lire dans cet ordre

1. `AGENTS.md` ou `CLAUDE.md` — consignes d'entrée pour l'agent.
2. `conventions/testing.md` — stratégie de tests consolidée.
3. `conventions/frontend.md` — convention Angular consolidée. Le design system est défini dans
   `conventions/design-system.md`.
4. `profiles/README.md` puis les documents métier locaux du dépôt consommateur.

Les règles agents/skills/IA, MCP, RAG et BI ont été centralisées dans les conventions à la racine
(`agents-ia.md`, `mcp.md`, `rag.md`, `architecture.md`, `metrics.md` et `testing.md`). Elles ne sont
plus maintenues en double dans ce snapshot.

En cas de conflit, une décision locale documentée ne peut pas affaiblir les exigences de sécurité,
d'audit ou de confidentialité du socle. Toute dérogation est inscrite dans un ADR du projet avec
raison, risque, responsable et date de réexamen.

## Structure

```text
AGENTS.md, CLAUDE.md       Entrées courtes pour les outils d'agents
profiles/                  Profils techniques encore à examiner et centraliser
skills/                    Procédures techniques encore à examiner et centraliser
```

## Consommation

Chaque projet copie une version publiée du socle, inscrit `STAPORT_STANDARDS_VERSION` dans son
README ou fichier de profil et conserve les conventions consommées dans Git. La synchronisation
propose un diff relisible ; elle ne réécrit jamais automatiquement les règles métier, les noms de
permissions, l'historique des migrations ou les décisions du projet.

Une nouvelle application part de `templates/application/`. Les dossiers de domaines restent vides
jusqu'à ce que le projet et son métier soient explicitement définis.

## Versions et publication

Versionnement sémantique : changement incompatible de règle = major ; ajout rétrocompatible = minor ;
correction/clarification sans changement d'obligation = patch. Les numéros de versions de framework
dans les profils sont des repères datés : avant un nouveau projet ou upgrade, vérifier les versions
stables et prises en charge aux sources officielles, puis mettre à jour le profil et son changelog.

L'adoption des conventions se fait par changements relus dans chaque projet ; elle ne modifie pas automatiquement le code, les données ou les décisions locales.

## Références vérifiées le 2026-10-10

- [Spring Boot versions](https://docs.spring.io/spring-boot/spring-projects.html)
- [PostgreSQL version support](https://www.postgresql.org/support/versioning/)
- [Spring AI PGvector store](https://docs.spring.io/spring-ai/reference/api/vectordbs/pgvector.html)
- [pgvector](https://github.com/pgvector/pgvector)
- [Flyway PostgreSQL](https://documentation.red-gate.com/flyway/reference/database-driver-reference/postgresql-database)
- [Angular Tailwind guide](https://angular.dev/guide/tailwind) · [Lucide Angular](https://lucide.dev/guide/packages/lucide-angular)
- [AG-UI protocol](https://github.com/ag-ui-protocol/ag-ui)
