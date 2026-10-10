# Profil PostgreSQL

Baseline vérifiée le 2026-10-10 : PostgreSQL 18.6, supporté jusqu'au 14 novembre 2030 selon le
calendrier officiel. Utiliser le dernier correctif supporté de la majeure choisie. `pgvector` est
disponible pour PostgreSQL 13+ ; choisir et verrouiller son image/extension et valider le fournisseur
de production.

Flyway PostgreSQL peut demander son module driver dédié suivant la version verrouillée. Inclure le
driver dans le BOM/gestion de dépendances du projet, tester migrations avec l'image réellement
déployée et éviter les commandes psql méta qui n'ont pas d'équivalent JDBC.
