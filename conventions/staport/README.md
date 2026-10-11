# Socle Staport consommé par ERP-RH

ERP-RH épingle la version **0.1.1** du dépôt central Staport Standards. Le snapshot exact est dans
[`v0.1.1/`](v0.1.1/) ; la version attendue est enregistrée dans
[`STAPORT_STANDARDS_VERSION`](../../STAPORT_STANDARDS_VERSION).

## Règle de synchronisation

- Le snapshot épinglé conserve les éléments Staport qui n'ont pas encore été examinés et
  centralisés. Pour tout sujet déjà fusionné, la source de vérité est la convention correspondante
  dans `conventions/` à la racine.
- Les copies encore présentes rendent le contenu restant disponible hors ligne. Elles sont
  examinées une par une ; une règle fusionnée est retirée de ce snapshot après vérification qu'elle
  est couverte à la racine.
- Les décisions métier, permissions, schémas et workflows ERP-RH restent documentés dans `docs/`.
  Les conventions racine décrivent les règles de développement et d'architecture applicables au
  projet et celles qui pourront être réutilisées par les applications suivantes.

## Domaines et skills

Les conventions racine [`agents-ia.md`](../agents-ia.md), [`mcp.md`](../mcp.md) et
[`rag.md`](../rag.md) définissent maintenant les règles communes agents, skills, MCP et RAG.
Les skills métier vivent avec la documentation ERP-RH du domaine (`docs/<domaine>/skills/`) et
guident l'agent sans accorder de droits.
