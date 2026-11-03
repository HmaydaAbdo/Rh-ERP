---
title: Serveur MCP
sidebar_position: 11
---

# Serveur MCP (SDK Python)

Les exigences de `conventions/mcp.md` ne dépendent pas du langage et restent applicables sans changement : adaptateurs vers les façades publiques du domaine (jamais un
accès parallèle aux repositories), propriété des calculs par le domaine, complétude des données sans plafond, descriptions faites pour un modèle, outils nommés par
domaine, lecture et écriture séparées, écritures idempotentes, aucun outil générique SQL/shell/fichier/réseau, identité et permissions revérifiées à chaque appel,
périmètre appliqué dans la requête, champs libres traités comme données, catalogue publié explicitement. Cette page donne leur mise en œuvre avec le SDK Python
officiel (sources lues le 2026-11-03 : documentation du SDK et exemples du dépôt `modelcontextprotocol/python-sdk`).

## Version du SDK

* Deux lignes existent : la 1.x (`mcp.server.fastmcp.FastMCP`) et la **2.x, ligne stable** (`mcp.server.MCPServer`). La 2.x supprime l'import `mcp.server.fastmcp`
  (renommage, pas de dépréciation) et change d'autres API : un code écrit pour l'une ne tourne pas sur l'autre.
* **Choix** : 2.x, version exacte épinglée dans le fichier de verrouillage, et la révision du protocole négociée consignée dans `docs/ia.md`. Les exemples de cette page
  utilisent l'API 2.x (`MCPServer`). Une montée de version majeure suit la règle d'`AGENTS.md` : relecture de la documentation, puis tests de contrat.

## Montage dans l'application FastAPI

* `MCPServer.streamable_http_app()` renvoie une application ASGI Starlette (transport **Streamable HTTP**, chemin par défaut `/mcp`), montée dans l'application principale.
* **Le `lifespan` d'une sous-application montée ne s'exécute jamais.** L'application hôte doit entrer elle-même dans `mcp.session_manager.run()` dans son `lifespan`
  (voir [architecture](./architecture.md)) ; sinon chaque requête échoue avec `RuntimeError: Task group is not initialized`.
* `session_manager` n'existe qu'après l'appel de `streamable_http_app()` : construire l'application MCP au niveau du module, n'utiliser le gestionnaire que dans le `lifespan`.
* Une montée sur `/` capte tous les chemins : déclarer les routes propres de l'application **avant** elle, ou monter l'application MCP sous un préfixe dédié.
* Les paramètres de transport (par exemple `json_response`, `stateless_http`, `transport_security`) se passent à `streamable_http_app()`, pas au constructeur.

## Mode sans état

La règle « préférer le mode sans état » est conservée : `streamable_http_app(stateless_http=True)`, aucun identifiant de session émis, rien retenu entre deux requêtes,
donc tout travailleur peut servir toute requête. Précisions documentées par le SDK :

* `stateless_http` n'agit que sur les clients de l'**ancienne ère** du protocole ; une connexion de la révision `2026-07-28` est sans session dans tous les cas ;
* en mode sans état, les requêtes du serveur vers le client (`ctx.elicit()`, échantillonnage, racines) échouent avec `NoBackChannelError` et les notifications sont perdues :
  **aucun outil ne s'appuie sur un aller-retour serveur→client** ; une confirmation humaine passe par le flux de l'interface, pas par une requête d'élicitation ;
* avec des sessions, plusieurs travailleurs exigent un routage collant ; c'est exclu tant que le mode sans état suffit.

## Transport : hôtes et origines

Le SDK active par défaut la protection contre le DNS rebinding et n'accepte que `localhost`. Derrière un vrai nom d'hôte, **toute requête est rejetée** (`421 Invalid Host header`,
`403 Invalid Origin header`) tant que `transport_security=TransportSecuritySettings(allowed_hosts=[...], allowed_origins=[...])` n'est pas renseigné.

* `allowed_hosts` : liste exacte, forme nue et forme avec port générique (`"mcp.example.com"`, `"mcp.example.com:*"`) ; `allowed_origins` ne concerne que les clients navigateur.
* Serveur destiné à un service seulement : `allowed_origins` vide (la règle « refuser tout `Origin` » de `mcp.md` est conservée) et route non publiée par le proxy public.
* Les valeurs viennent de la configuration (voir [configuration](./configuration.md)), jamais d'un littéral dans le code.

## Authentification et identité

* Le SDK sait jouer le rôle de **serveur de ressources OAuth 2.1** : on passe ensemble `token_verifier=` (objet `TokenVerifier` avec `async verify_token(token) -> AccessToken | None`)
  et `auth=AuthSettings(issuer_url, resource_server_url, required_scopes, validate_token_resource=True)`. Passer l'un sans l'autre lève `ValueError`.
* Le vérificateur ERP valide le jeton délégué court : **signature RS256 par clé publique/JWKS**, émetteur, **audience MCP**, expiration, scopes réduits (voir
  [sécurité](./securite.md)). `validate_token_resource=True` rejette un jeton dont la ressource n'est pas celle du serveur (refus de mauvaise audience, token passthrough).
* Le SDK ajoute alors le middleware d'authentification Bearer et un garde (`RequireAuthMiddleware`) qui impose les `required_scopes` ; la réponse non authentifiée
  porte l'URL des métadonnées de ressource. Un serveur réseau sans vérificateur accepterait des appels anonymes : **interdit**, un test le prouve.
* Dans un outil, `get_access_token()` renvoie l'`AccessToken` (identité, scopes, claims) de la requête ; il vaut `None` hors requête HTTP authentifiée (tests en mémoire, stdio).
  L'outil **réévalue** la permission effective et le périmètre de la fiche de poste à chaque appel : les scopes du jeton bornent, ils n'accordent pas.
* Le secret ou la clé privée du monolithe n'est jamais partagé avec le service IA (règle inchangée).

## Déclaration des outils

* Un outil = une fonction décorée par `@mcp.tool()`, rangée dans le package de son domaine (`domains/<domaine>/mcp.py`) et assemblée par `main.py` ; le catalogue publié
  est une **liste activée par configuration** : un outil écrit mais non déclaré n'est pas enregistré.
* Le schéma d'entrée est déduit des annotations. Paramètres décrits avec `Annotated[..., Field(description=..., ge=..., le=...)]` et énumérations `Literal` ;
  le SDK valide avant l'appel de la fonction (une borne dépassée renvoie une erreur d'outil). Retours typés (modèle Pydantic ou `dict` typé) pour un schéma de sortie.
* Le nom est préfixé par le domaine (`paie_rechercher_bulletins`) ; la description dit quand l'utiliser et quand préférer l'outil voisin (règle de `mcp.md`).
* **Chaque réglage de la définition cite sa source officielle** (règle « Aucun choix arbitraire » d'`AGENTS.md`). Ce que le SDK 2.x documente : le nom vient de la fonction et la
  description de la docstring (`name=` et `description=` sont acceptés pour les surcharger) ; les annotations de types **sont** le schéma d'entrée ; `title=` donne le nom lisible
  des interfaces ; `annotations=` porte `read_only_hint`, `open_world_hint`, et `destructive_hint` / `idempotent_hint` pour un outil qui écrit. Ces annotations sont des
  **indications, pas de la sécurité** : aucun contrôle ne repose sur elles. Les autres règles de forme (3 à 4 phrases au moins, limites d'usage, `input_examples`, réponse à fort
  signal, erreurs correctives) sont celles du tableau « Définition des outils » de `conventions/agents-ia.md`, avec leur source.
* En v2, un outil qui renvoie un `dict` n'est plus enveloppé automatiquement comme en v1 : le schéma de sortie et le contenu structuré se déduisent du type de retour annoté
  (modèle Pydantic ou `dict` typé), ou se construisent explicitement par `CallToolResult(content=..., structured_content=...)`.
* **Une fonction d'outil appelle la façade `api.py` du domaine** et rien d'autre : pas de `select()`, pas de calcul, pas d'arrondi dans l'adaptateur.
* Le paramètre `ctx: Context` est exclu du schéma ; il donne l'identifiant de requête pour la corrélation des journaux et le contexte de durée de vie. Le contexte
  typé (`Context[AppContext]`) donne accès aux ressources du `lifespan` du serveur MCP ; l'accès aux données reste celui du domaine (dépendances de session de `main.py`),
  pas un contexte global.

## Erreurs

* Erreur que le modèle peut corriger : lever `ToolError` (module `mcp.server.mcpserver.exceptions`) avec un message qui dit quoi corriger, sans recopier la valeur saisie ni exposer d'interne.
  La requête réussit avec `is_error=True` et le message dans `content`.
* Toute autre exception est une erreur technique : journalisée avec la corrélation, jamais renvoyée en détail au modèle.
* Un refus de permission est tracé comme tel ([audit](./audit.md)) puis renvoyé comme erreur d'outil générique.

## Tests

* Test **en mémoire** du serveur : `async with Client(mcp) as client: await client.call_tool(...)`, sans sous-processus ni transport (documenté par le SDK), avec `@pytest.mark.anyio`
  (voir [tests et qualité](./tests.md)). `get_access_token()` y vaut `None` : les tests d'identité passent par l'application HTTP complète avec `TestClient`.
* Tests HTTP : mauvaise audience, jeton sans scope, jeton expiré, jeton signé par une autre clé, `Origin` non admis, hôte non admis, appel anonyme, avec chaque fois le même
  refus que le parcours REST équivalent (y compris masquage des champs sensibles).
* Pagination sans plafond, idempotence d'une écriture rejouée et corrélation : cas de `conventions/mcp.md`, inchangés.
* Test de couverture du catalogue : chaque outil déclaré a une permission, une description relue et une évaluation dans le jeu de référence.
