# Ticket à ouvrir chez CopilotKit (E1.8)

Texte prêt à coller dans https://github.com/CopilotKit/CopilotKit/issues (rédigé le 2026-10-31, à relire avant envoi).

**Titre** : `@copilotkit/angular` 0.6.0 : `createAngularCatalog` incompatible avec `@a2ui/web_core` ≥ 0.12.0

**Description**

`@copilotkit/angular` 0.6.0 épingle `@a2ui/web_core` 0.10.4 (la branche `main` aussi). Avec `web_core` 0.14.0 forcé par
`overrides`, le catalogue construit par `createAngularCatalog` n'a plus aucun composant.

Cause : le journal de `web_core` 0.12.0 annonce « The `Catalog` constructor now requires `protocolVersion` as its second
parameter: `Catalog(id, protocolVersion, ...)` ». `CopilotA2UICatalog extends Catalog` et `createAngularCatalog` appellent
encore `new CopilotA2UICatalog(id, composants, fonctions)` : les arguments sont décalés.

Reproduction : Angular 22.2.3, `@copilotkit/angular` 0.6.0, `overrides: { "@a2ui/web_core": "0.14.0" }`,
`createAngularCatalog({...}, {...})` puis `catalog.components.has("MonComposant")` renvoie `false`.

Demande : adopter `@a2ui/web_core` 0.14.0 (et le protocole A2UI v1.0 qu'il apporte), ou indiquer la version prévue.
