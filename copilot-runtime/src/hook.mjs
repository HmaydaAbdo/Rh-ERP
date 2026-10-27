// Chargeur ESM officiel d'OpenTelemetry (import-in-the-middle) : sans lui, `import 'node:http'` n'est pas instrumenté dans un
// serveur écrit en modules ES. Préchargé avant `traces.mjs` (`node --import ./src/hook.mjs --import ./src/traces.mjs`).
import { register } from 'node:module';

register('@opentelemetry/instrumentation/hook.mjs', import.meta.url);
