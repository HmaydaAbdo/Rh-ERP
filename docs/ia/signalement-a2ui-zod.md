# Signalement à ouvrir chez A2UI (E1.10)

Texte anglais prêt à coller dans https://github.com/a2ui-project/a2ui/issues/new (rédigé le 2026-11-02, défaut
reproduit avec `@a2ui/web_core` 0.14.0 et zod 4.6.7). Les 10 premières lignes de ce fichier sont l'en-tête français : le
corps commence à la ligne 11 (`Select-Object -Skip 10`).

**Titre** : `@a2ui/web_core 0.14.0: validation errors throw TypeError under zod 4 (result.error.errors is undefined)`

**Description**

`PayloadValidator` formats validation failures with `result.error.errors.map(formatZodIssue)` (lines 189, 205, 215, 351
and 371 of `src/validation/payload-validator.js`). `ZodError.errors` was removed in zod 4, which only has `.issues`
(also present in zod 3). With zod 4 resolved for `@a2ui/web_core`, every genuine validation failure therefore surfaces as
`TypeError: Cannot read properties of undefined (reading 'map')` instead of an `A2uiValidationError`, which hides the
actual problem (component, property, expected type).

Zod 3.x is not a safe baseline for everybody: versions below 4.6.6 are affected by GHSA-mrhx-c7xc-m3w5 (high severity,
memory exhaustion) with no fix released in the 3.x line, so downstream projects have a reason to force zod 4 through
`overrides`, even though `@a2ui/web_core` declares `zod: ^3.25.76`.

**Reproduction**

```js
import { z } from 'zod'; // 4.6.7
const result = z.object({ a: z.string() }).strict().safeParse({ a: 1 });
console.log(typeof result.error.errors); // "undefined"
console.log(Array.isArray(result.error.issues)); // true
```

Any invalid component payload given to the message processor then throws the `TypeError` above.

**Suggested fix**

Use `result.error.issues` (valid in zod 3 and 4) in the five places of `payload-validator.js`, and
`e.errors ?? e.issues` already used in `catalog/types.js` and `resolution/data-context.js` can stay as is. Optionally
widen the declared range to `zod: ^3.25.76 || ^4`.

For now we catch the error in our surface component and show a readable fallback, so this is not blocking us.
