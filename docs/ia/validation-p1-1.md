# P1.1 — preuve de compatibilité MCP Java / TypeScript

**2026-10-23 — prototype local testé, en revue propriétaire.**
Branche `codex/integration-ia-mcp-rag`, travail repris depuis `f2a3b45`.
L'autorisation porte seulement sur cette première tâche ; aucune décision d'identité ou
d'adoption production n'est déduite des tests. Voir le [plan](plan-integration.md) et
l'[ADR 0013](../adr/0013-integration-ia-mcp-langgraph-rag.md).

## Résultat observable

Un client officiel TypeScript initialise une session MCP avec un vrai serveur Servlet Java,
découvre un outil synthétique et obtient son résultat structuré. Les entrées invalides et
l'outil inconnu sont refusés. Après terminaison, la session n'est plus utilisable et le serveur
libère son port. Aucun domaine métier, modèle, base ou environnement de production n'est appelé.

Le [profil Maven](../../backend/pom.xml) ajoute uniquement des dépendances de portée `test` et
des sources dédiées, avec sorties isolées dans `target/mcp-compatibility`. Le
[test Java](../../backend/src/mcp-compatibility/java/staport/rh/compatibility/McpCompatibilityTest.java)
emploie le classpath réel du backend, notamment ses surcharges Jackson/Tomcat. Le contexte
Servlet est créé directement sans SpringApplication, scan, auto-configuration ou lecture `.env`.
Le [client TypeScript](../../scripts/ia/mcp-compatibility/src/interop.test.ts) utilise le SDK et
ses schémas ; il ne réimplémente pas un client métier REST.

## Matrice de versions réellement exercée

| Élément | Version / comportement observé |
|---|---|
| JDK local | Oracle Java 21.0.9 |
| Maven local | 3.10.0, distribution déjà installée |
| Spring Boot | 4.1.1, dépendances du backend |
| Tomcat embarqué | 11.0.26, Servlet 6.1 |
| Jackson 3 / Jackson 2 sur le classpath | 3.1.7 / 2.21.7 |
| SDK Java | `mcp-core` + `mcp-json-jackson3` 2.1.0, MIT |
| Reactor / validation JSON Schema du SDK | 3.8.7 / networknt 3.0.6, versions résolues |
| Node local | 24.21.0 ; CI configurée 24.15.0, exécution distante non vérifiée |
| Client SDK TypeScript | `@modelcontextprotocol/sdk` 1.32.1, MIT ; branche compatible avec le protocole 2025 |
| Compilation TS / types Node | TypeScript 6.0.3 / `@types/node` 24.10.0, lockfile versionné |
| MCP négocié | **2025-11-25**, Streamable HTTP, session et réponses SSE dans cette combinaison |

La ligne moderne MCP 2026-07-28 n'est pas validée par ce test. Le Java 2.2.0-M1 aperçu dans
les releases est une préversion, non adoptée. Cette preuve confirme une combinaison technique
candidate pour D3 ; le propriétaire n'a pas encore approuvé son adoption.

## Tests et contrôles

| Contrôle | Résultat local |
|---|---|
| Négociation version, identité serveur et capacités | Réussi |
| Catalogue limité à `compat_echo`, schémas d'entrée/sortie fermés | Réussi |
| Unicode FR/arabe/emoji, guillemets, antislash et caractères HTML | Résultat textuel et structuré identiques à l'entrée synthétique |
| Mauvais type, propriété supplémentaire, argument absent, vide, dépassement | Cinq refus par le validateur du SDK ; `isError=true`, aucun résultat structuré |
| Outil inconnu | Erreur MCP `InvalidParams`, pas de stacktrace dans la réponse |
| Fin de session | Réutilisation refusée en HTTP404 |
| Fermeture | Client fini dans le délai ; contexte fermé et port inaccessible après le test |
| Test Java / sous-tests Node | 1/1 et 10/10, aucun ignoré |
| Réinstallation reproductible | `npm ci --ignore-scripts --offline` réussi depuis le lockfile |
| Contrôle TypeScript | `npm run typecheck` réussi |
| Audit npm | Zéro vulnérabilité signalée au contrôle |
| Licences npm | 95 paquets non privés inspectés ; MIT, ISC, BSD-2/3-Clause, Apache-2.0 |
| SBOM Java de test | 267 composants ; portée test incluse, fichier séparé de la production |
| OSV local | 267 coordonnées publiques Maven interrogées par `querybatch`, zéro vulnérabilité signalée |
| Runtime normal | Arbre Maven sans profil : aucun `io.modelcontextprotocol.sdk` ni Spring AI |
| Garde CI de runtime | Code exact du YAML vérifié : arbre normal accepté, fixtures MCP et Spring AI refusées |
| Régression ciblée backend sans profil | 44 tests existants architecture/audit/routes/JWT réussis, aucun ignoré |
| Build frontend | `npm run build` réussi ; aucun fichier frontend modifié |
| Liens et diff | 16 documents contrôlés, aucune cible locale manquante ; `git diff --check` réussi |

Les cinq refus de schéma ont aussi été observés dans les journaux SDK. La fixture ne contient
aucune donnée personnelle. Ces messages natifs ne constituent pas la politique d'erreur et de
journalisation du futur serveur métier : prévoir leur minimisation et leurs tests avant exposition.

Le premier essai attendait un code d'erreur personnalisé dans le handler. L'essai réseau a prouvé
que le SDK refuse auparavant les entrées invalides. La duplication du validateur a été retirée et
les assertions vérifient maintenant ce contrat effectif, le refus et l'absence de stacktrace ou
de valeur supplémentaire sensible synthétique. L'exécution immédiate de cet outil minuscule a
évité le thread Reactor associé au classloader web constaté au premier essai ; aucun tel
avertissement n'apparaît au dernier test. Ce choix ne fixe pas la stratégie des futurs outils longs.

## Commandes et rapports

Le [README du prototype](../../scripts/ia/mcp-compatibility/README.md) donne la commande portable.
Sur le poste, `JAVA_HOME=C:\Program Files\Java\jdk-21` et la distribution Maven 3.10.0 déjà
installée décrite dans le [handoff](../handoff/integration-ia.md) ont été utilisés.

```powershell
# Racine
npm ci --ignore-scripts --prefix scripts/ia/mcp-compatibility
npm run typecheck --prefix scripts/ia/mcp-compatibility
npm audit --audit-level=moderate --prefix scripts/ia/mcp-compatibility
# backend/
.\mvnw.cmd -B -o -P mcp-compatibility '-Dtest=McpCompatibilityTest' test
.\mvnw.cmd -B -o '-Dtest=ArchitectureConventionsTest,AuditArchitectureTest,EndpointSecurityTest,JwtSecurityChainTest' test
.\mvnw.cmd -B -o dependency:tree '-Dscope=runtime' '-DoutputFile=target/mcp-default-runtime-dependencies.txt'
.\mvnw.cmd -B -P mcp-compatibility -DskipTests cyclonedx:makeBom
```

Rapports locaux générés, exclus de Git :

- `backend/target/mcp-compatibility/client.tap` et `surefire-reports/` ;
- `backend/target/mcp-compatibility/mcp-compatibility-bom.json` et `osv-batch.json` ;
- `backend/target/mcp-default-runtime-dependencies.txt` ;
- `backend/target/surefire-reports/` pour les 44 tests ciblés.

La couverture JaCoCo de ces seules classes ne vaut pas la porte de couverture complète du dépôt.
Le fichier local cumulait une ancienne mesure de `IAuthService`, signalée comme incompatible :
aucune conclusion de couverture globale n'est tirée de cette exécution ciblée.

La CI est mise à jour pour installer/vérifier le client, tester le profil, générer son SBOM avec
portée test et le scanner. Le SBOM de production excluant ces dépendances, un scan distinct était
nécessaire. **La CI distante n'est pas exécutée ; aucun résultat distant ni déploiement n'est annoncé.**
La revue indépendante du prototype, des états et des limites n'a laissé aucun défaut confirmé.

## Limites et porte suivante

Ce prototype ne prouve ni OAuth/JWT délégué, ni RBAC, ni audit métier, ni proxy/TLS/HTTP2, ni
charge, ni sécurité d'une interface générée. Le serveur est éphémère et loopback, sans
authentification applicative ; il ne doit pas être extrait du test ou exposé comme serveur réel.
Aucune permission, migration ou source `src/main` n'a changé. La pile Docker et le port 4200 du
propriétaire n'ont pas été utilisés par le prototype.

**État : en revue propriétaire. P1.2 demeure non commencée.** À la reprise, présenter cette preuve
et consigner l'accord ou les réserves ; ne commencer l'étude d'identité qu'après validation explicite.

## Sources officielles consultées

- [SDK Java : releases et stabilité](https://github.com/modelcontextprotocol/java-sdk/releases).
- [SDK Java 2.1.0 : sources et transport Servlet](https://github.com/modelcontextprotocol/java-sdk/tree/v2.1.0).
- [SDK TypeScript 1.32.1](https://github.com/modelcontextprotocol/typescript-sdk/releases/tag/1.32.1).
- [MCP 2025-11-25 : transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).
- [Build Helper : ajout de sources de test](https://www.mojohaus.org/build-helper-maven-plugin/add-test-source-mojo.html).
