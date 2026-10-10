# Autorisations par domaine

## Modèle

Adopter le RBAC dynamique de référence ERP-RH : catalogue de permissions stable et versionné dans le
code ; rôles composables administrés par les personnes autorisées ; attribution de rôles aux
comptes ; refus individuel explicite prioritaire sur les permissions héritées. Les permissions
réelles sont définies dans la documentation de chaque application, pas dans le socle.

```text
Utilisateur ── rôles ── permissions du catalogue
     └──── refus individuels ────────────────┘
effectives = union(permissions des rôles) − refus individuels
```

Convention de code à confirmer au profil du projet, par exemple `<DOMAINE>_<RESSOURCE>_<ACTION>`.
Chaque action est intentionnelle (lecture, création, modification, suppression, export,
administration) ; éviter les permissions vagues telles que `ADMIN_ALL` pour les écrans métier.

## Obligations

- Le backend est l'autorité : contrôle `@PreAuthorize` ou équivalent sur chaque endpoint métier,
  refus par défaut, pagination bornée et validation côté serveur. Un guard Angular améliore l'UX mais
  ne sécurise jamais une API.
- Le catalogue fixe vient du code et de migrations Flyway ; l'UI peut composer les rôles mais ne
  crée pas un nouveau code de permission arbitraire.
- Les refus individuels sont visibles et expliqués dans l'administration des droits. Un deny prévaut
  sur les droits de rôles ; les stratégies de cache/refresh et leur délai sont documentés.
- Les comptes d'accès restent séparés des personnes/employés/clients du domaine. Le lien est
  optionnel si le métier le justifie.
- La suppression suit une permission explicite de domaine. Aucune règle de rôle codée en dur sauf
  exception de sécurité documentée et validée.
- Les événements d'accès refusé sont audités une fois via le mécanisme commun, jamais depuis chaque
  contrôleur.

## Documentation locale obligatoire

Un seul `docs/rbac/README.md` par application, avec une section exhaustive par domaine : endpoints,
permission requise, routes/guards Angular, boutons/actions conditionnés, événements sensibles et
tests associés. Toute modification de permission met à jour le catalogue, seed/migration, tests et
chapitre RBAC dans le même changement.

Les skills métier peuvent expliquer à un agent quelles permissions demander ou quelles données
rechercher ; elles n'accordent jamais de droit et ne remplacent pas le contrôle serveur.
