// Traces OpenTelemetry du runtime (docs/ia.md, T18) : SDK officiel, exportateur OTLP/HTTP en protobuf (format que Phoenix exige) et instrumentations de `http`
// (requêtes entrantes) et d'`undici` (appels `fetch` vers le service IA, avec en-tête W3C `traceparent`). Chargé avant le
// reste du serveur (`node --import`). Sans OTEL_EXPORTER_OTLP_ENDPOINT, rien n'est démarré.
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';

if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  const sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME ?? 'erp-rh-copilot-runtime',
    // Endpoint, en-têtes (OTEL_EXPORTER_OTLP_HEADERS) et délais viennent des variables standard d'OpenTelemetry.
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [
      new HttpInstrumentation({
        // La sonde de santé du conteneur n'est pas une trace utile.
        ignoreIncomingRequestHook: (requete) => requete.url === '/health'
      }),
      new UndiciInstrumentation()
    ]
  });
  sdk.start();
  process.on('SIGTERM', () => void sdk.shutdown());
}
