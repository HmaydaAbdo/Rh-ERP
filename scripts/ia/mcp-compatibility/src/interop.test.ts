import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

// Le serveur MCP est celui de l'API Python (FastMCP, route /mcp), démarré par `api/tests/test_mcp_clients_externes.py`
// avec une base de test réelle ; le jeton est le jeton agent RS256 émis par `POST /auth/jetons/agent`.
const endpoint = new URL(process.env.MCP_ERP_RH_URL ?? "http://invalid.invalid/");
const jeton = process.env.MCP_ERP_RH_JETON ?? "";
const utilisateur = process.env.MCP_ERP_RH_UTILISATEUR ?? "";
assert.equal(endpoint.protocol, "http:");
assert.equal(endpoint.hostname, "127.0.0.1", "Seul le serveur de test loopback est admis");
assert.equal(endpoint.pathname, "/mcp");
assert.ok(jeton, "MCP_ERP_RH_JETON absent");
assert.equal(jeton.split(".").length, 3, "Un jeton agent est un JWT compact");

const timeout = { timeout: 10_000, maxTotalTimeout: 10_000 };
const client = new Client({ name: "staport-compatibility-client", version: "E2" });
const transport = new StreamableHTTPClientTransport(endpoint, {
  requestInit: { headers: { Authorization: `Bearer ${jeton}` } },
});

before(async () => {
  await client.connect(transport, timeout);
});

after(async () => {
  await client.close();
});

test("initialise une révision commune et découvre les capacités", () => {
  assert.equal(transport.protocolVersion, "2025-11-25");
  assert.ok(client.getServerCapabilities()?.tools);
});

test("découvre le catalogue d'outils de l'application", async () => {
  const result = await client.listTools({}, timeout);
  const noms = result.tools.map((tool) => tool.name);
  assert.equal(noms.length, 31);
  for (const attendu of ["systeme_identite", "paie_indicateurs", "employes_rechercher", "chantier_rechercher", "accueil_lire"]) {
    assert.ok(noms.includes(attendu), `outil absent : ${attendu}`);
  }
});

test("l'identité vient du jeton RS256, jamais des arguments", async () => {
  const result = CallToolResultSchema.parse(await client.callTool({ name: "systeme_identite", arguments: {} }, undefined, timeout));
  assert.equal(result.isError, false);
  const donnees = result.structuredContent as { utilisateur: string; autorites: string[] };
  assert.equal(donnees.utilisateur, utilisateur);
  assert.ok(donnees.autorites.includes("IA_UTILISER"));
});

test("refuse un argument inconnu par le schéma de l'outil", async () => {
  const result = CallToolResultSchema.parse(
    await client.callTool({ name: "systeme_identite", arguments: { userId: "valeur-synthetique" } }, undefined, timeout),
  );
  assert.equal(result.isError, true);
  const texte = result.content.map((c) => (c.type === "text" ? c.text : "")).join("");
  assert.match(texte, /unexpected|systeme_identite/i);
  assert.doesNotMatch(texte, /Traceback|\bFile ".+", line \d+/);
});

test("sans jeton ou avec un jeton falsifié, le serveur répond 401", async () => {
  for (const entete of [undefined, "Bearer " + jeton.slice(0, -3) + "abc"]) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...(entete ? { authorization: entete } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      signal: AbortSignal.timeout(10_000),
    });
    assert.equal(response.status, 401);
    await response.body?.cancel();
  }
});

test("le serveur est sans session : aucune session n'est ouverte ni à refermer", () => {
  assert.equal(transport.sessionId, undefined);
});
