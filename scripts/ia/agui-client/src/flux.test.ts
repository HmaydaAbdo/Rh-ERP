// T7 (docs/ia.md) : le client AG-UI officiel (@ag-ui/client, HttpAgent) dialogue avec le point d'entrée du service IA.
// Lancé par FluxAgUiIntegrationTest (backend) contre un service IA, un Spring de test et une passerelle LiteLLM réels.
import assert from "node:assert/strict";
import { test } from "node:test";
import { HttpAgent, type BaseEvent } from "@ag-ui/client";

const url = new URL(process.env.AGUI_URL ?? "http://invalid.invalid/");
assert.equal(url.hostname, "127.0.0.1", "Seul le service IA local de test est admis");
assert.equal(url.pathname, "/agui");
const jeton = process.env.AGUI_JETON ?? "";
const question = process.env.AGUI_QUESTION ?? "";
const attendu = process.env.AGUI_ATTENDU ?? "";
assert.ok(jeton && question && attendu, "AGUI_JETON, AGUI_QUESTION et AGUI_ATTENDU requis");

type Evenement = BaseEvent & Record<string, unknown>;

function agent(jetonConnexion: string): HttpAgent {
  const nouvel = new HttpAgent({ url: url.toString(), headers: { Authorization: `Bearer ${jetonConnexion}` } });
  nouvel.messages = [{ id: "m1", role: "user", content: question }];
  return nouvel;
}

test("une question suit le cycle AG-UI jusqu'à la réponse vérifiée", { timeout: 300_000 }, async () => {
  const recus: Evenement[] = [];
  const client = agent(jeton);

  const { newMessages } = await client.runAgent({}, { onEvent: ({ event }) => void recus.push(event as Evenement) });
  // Les assertions sont faites après le run : une erreur levée dans un abonné serait avalée par le client.

  const types: string[] = recus.map((e) => e.type);
  assert.equal(types[0], "RUN_STARTED");
  assert.equal(types.at(-1), "RUN_FINISHED");
  assert.ok(!types.includes("RUN_ERROR"));
  assert.ok(types.includes("TOOL_CALL_START") && types.includes("TOOL_CALL_RESULT"), "au moins un outil Spring");
  // Le client reconstruit lui-même le message assistant à partir des événements.
  const assistant = newMessages.filter((m) => m.role === "assistant" && typeof m.content === "string").at(-1);
  assert.ok(assistant && String(assistant.content).replaceAll(/\s/g, "").includes(attendu), String(assistant?.content));
  const reponse = recus.find((e) => e.type === "CUSTOM" && e.name === "com.staport.answer.v1");
  assert.equal((reponse?.value as { abstention: boolean }).abstention, false);
  const sequences = recus
    .filter((e) => e.type === "CUSTOM" && e.name === "com.staport.mascot.state.v1")
    .map((e) => (e.value as { sequence: number }).sequence);
  assert.ok(sequences.length >= 2);
  assert.deepEqual(sequences, [...sequences].sort((a, b) => a - b));
});

test("l'arrêt par le client coupe le run sans événement tardif", { timeout: 120_000 }, async () => {
  // Le client avale les erreurs levées dans un abonné : on collecte, on vérifie après.
  const apresArret: string[] = [];
  const client = agent(jeton);
  let arrete = false;

  const run = client.runAgent(
    {},
    {
      onEvent: ({ event }) => {
        if (arrete) {
          apresArret.push(event.type);
        } else if (event.type === "STEP_STARTED") {
          arrete = true;
          client.abortRun();
        }
      },
    },
  );
  await run.catch(() => undefined); // un abandon peut finir en rejet selon le moment : seul l'arrêt compte
  await new Promise((fin) => setTimeout(fin, 2_000));

  assert.ok(arrete);
  // Seul le RUN_ERROR que le client produit lui-même à l'abandon est admis ; rien du serveur.
  assert.deepEqual(
    apresArret.filter((type) => type !== "RUN_ERROR"),
    [],
  );
});

test("un jeton de connexion invalide est refusé avant tout flux", { timeout: 30_000 }, async () => {
  const recus: string[] = [];
  await assert.rejects(agent("jeton-invalide").runAgent({}, { onEvent: ({ event }) => void recus.push(event.type) }));
  assert.ok(!recus.includes("RUN_STARTED"));
});
