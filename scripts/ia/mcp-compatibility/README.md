# Prototype MCP — première tâche P1.1

Client TypeScript de test uniquement, associé au profil Maven `mcp-compatibility` du backend.
Le serveur n'existe que pendant le test Java : loopback, port éphémère, outil synthétique,
aucun SpringApplication/scan, aucune base ni configuration applicative. Aucun SDK MCP ne fait
partie du runtime normal. Ce dossier n'est pas le futur runtime d'orchestration IA.

Depuis la racine, avec Java21, Node24.15+ (<25) et Maven configurés :

```powershell
npm ci --ignore-scripts --prefix scripts/ia/mcp-compatibility
npm run typecheck --prefix scripts/ia/mcp-compatibility
npm audit --audit-level=moderate --prefix scripts/ia/mcp-compatibility
Set-Location backend
.\mvnw.cmd -B -P mcp-compatibility '-Dtest=McpCompatibilityTest' test
```

Sur un autre OS, utiliser `./mvnw` à la dernière ligne. Une fois les dépendances résolues, `-o`
permet le test hors ligne. Si le wrapper ou le cache local bloque, voir la commande de distribution
installée dans le [handoff](../../../docs/handoff/integration-ia.md), sans modifier le wrapper.

Le test Java démarre Tomcat, fournit `MCP_COMPATIBILITY_URL` au processus Node, attend ses dix
scénarios, ferme les deux côtés et vérifie que le port est libéré. Ne pas lancer `npm test` contre
une API de l'application : le client refuse une URL autre que `http://127.0.0.1:<port>/mcp`.

Sorties séparées : `backend/target/mcp-compatibility/client.tap`, `surefire-reports/`, classes et
couverture du seul profil. Le lockfile npm et les versions Maven sont versionnés. Les entrées
invalides sont refusées par le validateur de schéma du SDK, avant l'outil ; leurs messages bruts
sont seulement observés sur des données synthétiques. Leur adaptation publique/RH reste à faire.

Inventaire Java incluant la portée de test, distinct du SBOM de production :

```powershell
.\mvnw.cmd -B -P mcp-compatibility -DskipTests cyclonedx:makeBom
```

Le résultat est `target/mcp-compatibility/mcp-compatibility-bom.json`. La CI prépare le client,
exécute le test et scanne aussi ce SBOM avec OSV avant de pouvoir réussir son job backend.
La réussite distante ne doit pas être présumée d'après un résultat local.

Résultat, versions, limites et validation attendue : [preuve P1.1](../../../docs/ia/validation-p1-1.md).
**La tâche P1.2 n'est pas autorisée par l'exécution de ce test.**
