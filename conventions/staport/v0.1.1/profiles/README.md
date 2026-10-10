# Profils techniques

Profils retenus pour les applications Staport :

- `spring-boot.md` — Spring Boot 4.x, Java, Spring AI/MCP et compatibilité des starters.
- `angular.md` — Angular 22.x, Node/TypeScript/RxJS, Signals et bibliothèques compatibles.
- `postgresql.md` — PostgreSQL 18, Flyway, extension pgvector selon besoin.

Ce dossier consigne les versions vérifiées et leur matrice de compatibilité. Le socle donne les
règles ; chaque profil consommateur verrouille des versions exactes (`pom.xml`, lockfile, image DB)
et les met à jour avec un changelog. Ne pas recopier un numéro devenu obsolète dans un projet neuf.
