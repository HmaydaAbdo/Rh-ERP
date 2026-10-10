# Architecture et frontières

## Règle commune

Commencer par un monolithe modulaire. Un domaine est propriétaire de ses règles, commandes,
repositories et modèles de lecture. Une extraction en service indépendant demande un besoin mesuré
(déploiement indépendant, isolation, charge, équipe ou frontière de sécurité), un ADR et une stratégie
de données/API. Ne pas transformer une frontière de package en microservice par anticipation.

```text
application/
  domains/<domaine>/          métier et tests du domaine
  platform/                   identité, RBAC, audit, observabilité
  integrations/               adaptateurs vers des systèmes externes
```

L'arborescence exacte peut suivre le framework si les frontières restent vérifiables.

## Propriété des données

- Chaque domaine est propriétaire de son modèle et de son stockage logique. Pas d'accès direct au
  repository d'un autre domaine ; utiliser une façade publique, un contrat ou un événement explicite.
- Les applications G-Banque et ERP-RH ont des bases PostgreSQL distinctes et des migrations
  indépendantes. PostgreSQL commun ne signifie ni schéma partagé ni transactions distribuées.
- Un agent central appelle des APIs/outils autorisés ; il ne lit jamais directement les bases
  applicatives.
- Tout appel externe est derrière un port/adaptateur, avec timeout, limites et erreurs documentées.

## Décisions et changements

Documenter une décision structurante dans `docs/adr/NNNN-titre.md` : contexte, décision, options,
conséquences et statut. Une migration de données, un changement d'identité, un nouveau datastore ou
un protocole d'agent transversal demande un plan de migration et de retour arrière avant déploiement.
