-- Extensions PostgreSQL requises par le projet.
--
-- pgvector : aucune colonne/fonctionnalité vectorielle n'existe encore dans le schéma (aucun besoin
-- métier identifié à ce jour, conventions/architecture.md — ne jamais introduire une abstraction
-- sans nécessité clairement identifiée). L'extension est activée par anticipation d'un usage futur
-- (recherche sémantique, embeddings) décidé par l'utilisateur ; son activation seule n'a aucun effet
-- sur le schéma applicatif tant qu'aucune colonne "vector" n'est ajoutée.
CREATE EXTENSION IF NOT EXISTS vector;
