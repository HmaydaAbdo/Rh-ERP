# Stratégie de tests — unitaire à E2E

La suite privilégie beaucoup de vérifications rapides et déterministes, des intégrations réelles aux
frontières importantes et un petit nombre de parcours navigateur représentatifs. Chaque exigence
de sécurité/permission possède aussi un test négatif.

| Niveau | Exemples Staport | Porte attendue |
|---|---|---|
| Statique / architecture | format, lint, compilation, dépendances, couverture architecture | chaque PR |
| Unitaire | règles de domaine, calculs financiers/RH, autorisations, validators, Signals, schémas de formulaires | chaque PR |
| Composant | interactions clavier, formulaires, états UI, focus, responsive, reduced motion | chaque PR concernée |
| Intégration | Spring + PostgreSQL/pgvector réel via Testcontainers, Flyway, Envers, RBAC, repositories, services MCP | changements backend concernés |
| Contrat | OpenAPI, schémas MCP, événements AG-UI, flux et contrats BI | chaque modification de contrat |
| E2E | parcours utilisateur complet Angular/API, login, droits, action et audit | parcours critiques avant fusion/release |
| Non-fonctionnel | accessibilité, charge/latence, résilience, sécurité, coût/limites agent | par risque et avant release |
| Évaluation IA/BI | dataset de référence versionné, citations, refus, KPI, filtres et permissions | tout changement de prompt, modèle, outil, index ou mesure |

## Obligations de réalisation

- Tester pgvector sur une image/version compatible avec la production lorsque cette extension est
  activée. Les tests PostgreSQL, migrations vierges et mises à niveau sont définis dans
  `conventions/database.md`.
- Tests d'autorisation couvrent les accès anonyme, authentifié sans permission et avec permission,
  les routes et actions UI, ainsi que le périmètre métier si le projet l'utilise.
- Tests audit vérifient intégrité transactionnelle et droits du compte applicatif. Fixtures
  synthétiques uniquement ; aucun dataset personnel/financier réel.
- E2E pilotés par noms accessibles, rôle et libellés ; pas de temporisations arbitraires ou
  sélecteurs CSS fragiles. Couvre clavier et états chargement, vide, erreur et accès refusé.
- Tests MCP vérifient schéma, identité, permission, bornes de résultats, pagination, idempotence,
  timeout/retry et injection de prompt. Un refus ne doit jamais se transformer en accès par défaut.
- Les évaluations probabilistes d'un LLM ne remplacent pas les assertions déterministes. Suivre
  exactitude, citation/source, refus sécurisé, latence et coût ; conserver un jeu de régression
  versionné et anonymisé.
- BI : tester la formule de chaque KPI, périodes, fuseaux, arrondis, filtres, permissions et absence
  de double comptage contre des fixtures de référence.

Les contrôles rapides s'exécutent localement et à chaque PR ; les tests de navigateur, de charge et
évaluations lourdes tournent sur les chemins concernés et avant release. Toute dérogation est
temporaire, motivée, assignée et datée.
