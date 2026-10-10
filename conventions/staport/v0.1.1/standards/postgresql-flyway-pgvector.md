# PostgreSQL, Flyway et pgvector

## Base relationnelle

- PostgreSQL est le moteur relationnel commun. Baseline vérifiée pour cette édition : PostgreSQL
  18.6 ; sélectionner ensuite un correctif supporté de la même majeure et le mettre à jour
  régulièrement.
- Une base et des identifiants de service distincts par application/environnement. Ne pas partager
  les tables métier entre G-Banque, ERP-RH et l'orchestrateur IA.
- Flyway est l'unique propriétaire des changements de schéma. Scripts SQL versionnés dans
  `backend/src/main/resources/db/migration/`; migrations appliquées immuables ; nouvelle migration
  pour chaque correction. `spring.jpa.hibernate.ddl-auto=validate`, jamais `update`/`create` en
  environnement partagé.
- Les noms SQL, contraintes, clés étrangères et index sont explicites. Utiliser UTC (`TIMESTAMPTZ`)
  pour les instants ; `NUMERIC`/`BigDecimal` pour les valeurs financières. Les requêtes volumineuses
  sont bornées et les index s'appuient sur des filtres réellement utilisés.
- Distinguer l'utilisateur propriétaire/migration du compte d'exécution. Celui-ci ne peut jamais
  modifier ou supprimer les tables d'audit.
- Toute migration de données auditées écrit Envers/journal dans la même migration atomique selon le
  gabarit `audit.md`. Les scripts de migration sont testés sur base vierge et copie mise à niveau.

## pgvector et recherche sémantique

`pgvector` est une extension PostgreSQL utile pour les embeddings, la recherche exacte ou ANN. Sa
disponibilité n'impose pas de vectoriser les données. Activer `vector` uniquement dans la base où un
cas d'usage autorisé le justifie ; valider la disponibilité de l'extension chez l'hébergeur et dans
les images de test/déploiement.

- Gérer `CREATE EXTENSION` et les tables par Flyway/ops avec privilèges de migration. Ne pas laisser
  le démarrage applicatif créer/supprimer le schéma Spring AI. Garder
  `spring.ai.vectorstore.pgvector.initialize-schema=false` et vérifier la compatibilité du schéma
  sur la version verrouillée de Spring AI.
- Utiliser une table/espace logique séparé du modèle métier. Chaque document stocké porte des
  métadonnées de provenance, version, date d'indexation et contrôle d'accès. Toute recherche filtre
  les permissions avant de renvoyer un fragment.
- Fixer modèle, dimensions, distance, stratégie d'index et seuils par corpus dans un ADR ; les
  changements de dimensions impliquent une réindexation planifiée, jamais une conversion implicite.
- Prévoir suppression/re-indexation, fraîcheur, chiffrement, sauvegarde, rétention et effacement
  des vecteurs dérivés avec la source. Les embeddings de données RH/paie ou financières restent
  sensibles et cloisonnés.

## Migration MariaDB → PostgreSQL (G-Banque)

La cible est PostgreSQL/Flyway, mais le basculement des données est un projet contrôlé, séparé des
changements fonctionnels : inventorier les types/fonctions et requêtes, définir le mapping, convertir
sur une copie, rejouer les migrations, comparer volumes/agrégats/contraintes, valider les cas métier,
faire une répétition chronométrée, fixer fenêtre et gel des écritures, sauvegarde restaurable, puis
procédure de retour arrière. Pas de double écriture improvisée ni de bascule production depuis une
simple migration de convention.
