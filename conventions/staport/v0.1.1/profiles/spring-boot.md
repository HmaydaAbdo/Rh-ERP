# Profil Spring Boot

Baseline vérifiée le 2026-10-10 : Spring Boot 4.1.1 stable ; Java 17 minimum selon les exigences
officielles. Confirmer la version LTS du JDK cible, Maven/Gradle et la matrice des starters avant
verrouillage.

- Utiliser le BOM Spring Boot et celui de Spring AI ; aucune version isolée pour les dépendances
  gérées.
- Après passage à Boot 4, contrôler modularisation des starters, Jakarta, Spring Framework,
  observabilité, sécurité et compatibilité de chaque librairie.
- Spring AI MCP et PGVectorStore suivent la version compatible Boot verrouillée ; désactiver
  l'initialisation automatique du schéma vectoriel et laisser Flyway le gérer.
- Compiler, tests unitaires, intégration Testcontainers et contrats API avant de mettre à jour une
  version majeure.
