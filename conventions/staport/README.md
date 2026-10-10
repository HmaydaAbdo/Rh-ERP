# Socle Staport consommé par ERP-RH

ERP-RH épingle la version **0.1.1** du dépôt central Staport Standards. Le snapshot exact est dans
[`v0.1.1/`](v0.1.1/) ; la version attendue est enregistrée dans
[`STAPORT_STANDARDS_VERSION`](../../STAPORT_STANDARDS_VERSION).

## Règle de synchronisation

- Le dépôt Git `staport-standards` est la source canonique des règles communes, profils, rôles
  d'agents et skills partagées.
- Les copies locales rendent les règles disponibles hors ligne, aux agents et à la CI. Elles sont
  mises à jour depuis un tag publié par une PR explicite ; jamais par copie silencieuse.
- Les `conventions/*.md` à la racine complètent le socle pour l'architecture et les choix réels
  d'ERP-RH. Une règle locale peut préciser ou renforcer le socle. Si elle le contredit, ouvrir un
  ADR et corriger l'un des deux textes avant de poursuivre ; une règle locale ne relâche pas une
  exigence de sécurité, d'audit ou de confidentialité.
- Le métier, les permissions concrètes, le schéma et les workflows restent décrits dans `docs/`.
  Le standard central ne les remplace pas.

## Domaines et skills

Les skills communes sont sous `v0.1.1/skills/`. Les skills métier vivent avec la documentation
ERP-RH du domaine (`docs/<domaine>/skills/`), portent seulement des règles documentées et renvoient
au chapitre `docs/rbac/README.md`. Elles guident l'agent mais n'accordent aucun droit.
