# Ticket à ouvrir chez CopilotKit (E1.8)

Texte anglais prêt à coller dans https://github.com/CopilotKit/CopilotKit/issues/new (relu le 2026-11-02 ; versions
revérifiées : `@copilotkit/angular` 0.6.0 reste la dernière, `@a2ui/web_core` 0.14.0).

**Titre** : `@copilotkit/angular 0.6.0: createAngularCatalog incompatible with @a2ui/web_core >= 0.12.0`

**Description**

`@copilotkit/angular` 0.6.0 (latest) pins `@a2ui/web_core` 0.10.4. With `web_core` 0.14.0 forced through npm
`overrides`, the catalog built by `createAngularCatalog` ends up with no components.

**Cause.** The `@a2ui/web_core` 0.12.0 changelog says: "The `Catalog` constructor now requires `protocolVersion` as its
second parameter: `Catalog(id, protocolVersion, ...)`". `CopilotA2UICatalog extends Catalog` and `createAngularCatalog`
still call `new CopilotA2UICatalog(id, components, functions)`, so the arguments are shifted.

**Reproduction.** Angular 22.2.3, `@copilotkit/angular` 0.6.0, `overrides: { "@a2ui/web_core": "0.14.0" }`. Then:

```ts
const catalog = createAngularCatalog({ /* components */ }, { /* functions */ });
catalog.components.has('MyComponent'); // false
```

**Questions.**
1. Is adopting `@a2ui/web_core` 0.14.0 planned, and in which `@copilotkit/angular` version?
2. Do you have a date for A2UI protocol v1.0 support in the A2UI middleware and `ag-ui-a2ui-toolkit` (the toolkit
   currently emits v0.9)?

For now we render A2UI surfaces with `@a2ui/angular` 0.13 mounted as the catalog's `surfaceComponent`, so this is not
blocking us.
