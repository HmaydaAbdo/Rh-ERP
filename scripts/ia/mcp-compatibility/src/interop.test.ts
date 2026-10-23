import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema, ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";

const endpoint = new URL(process.env.MCP_COMPATIBILITY_URL ?? "http://invalid.invalid/");
assert.equal(endpoint.protocol, "http:");
assert.equal(endpoint.hostname, "127.0.0.1", "Seul le serveur de test loopback est admis");
assert.equal(endpoint.pathname, "/mcp");

const client = new Client({ name: "erp-rh-compatibility-client", version: "P1.1" });
const transport = new StreamableHTTPClientTransport(endpoint);
const timeout = { timeout: 5_000, maxTotalTimeout: 5_000 };

before(async () => {
  await client.connect(transport, timeout);
});

after(async () => {
  try {
    await transport.terminateSession();
  } finally {
    await client.close();
  }
});

test("initialise une révision commune et découvre les capacités", () => {
  assert.equal(transport.protocolVersion, "2025-11-25");
  assert.deepEqual(client.getServerVersion(), { name: "erp-rh-compatibility", version: "P1.1" });
  assert.ok(client.getServerCapabilities()?.tools);
  assert.ok(transport.sessionId);
});

test("découvre uniquement le contrat synthétique borné", async () => {
  const result = await client.listTools({}, timeout);
  assert.deepEqual(result.tools.map((tool) => tool.name), ["compat_echo"]);
  const tool = result.tools[0];
  assert.deepEqual(tool.inputSchema.required, ["message"]);
  assert.equal(tool.inputSchema.additionalProperties, false);
  assert.deepEqual(tool.outputSchema?.required, ["message", "synthetic"]);
});

test("préserve Unicode, guillemets et caractères HTML dans un résultat structuré", async () => {
  const message = 'Équipe «démo» مرحبا 🏗️ <script> " \\';
  const result = await client.callTool({ name: "compat_echo", arguments: { message } }, undefined, timeout);
  assert.equal(result.isError, false);
  assert.deepEqual(result.structuredContent, { message, synthetic: true });
  assert.deepEqual(result.content, [{ type: "text", text: message }]);
});

for (const [name, args] of [
  ["type incorrect", { message: 42 }],
  ["propriété supplémentaire", { message: "démo", userId: "VALEUR_SYNTHETIQUE_A_NE_PAS_RETOURNER" }],
  ["argument absent", {}],
  ["texte vide", { message: "" }],
  ["texte trop long", { message: "x".repeat(81) }],
] as const) {
  test(`refuse par schéma : ${name}`, async () => {
    const result = CallToolResultSchema.parse(
      await client.callTool({ name: "compat_echo", arguments: args }, undefined, timeout),
    );
    assert.equal(result.isError, true);
    assert.equal(result.content.length, 1);
    const content = result.content[0];
    assert.equal(content.type, "text");
    if (content.type !== "text") throw new Error("Refus textuel attendu");
    assert.match(content.text, /^Tool \(compat_echo\) input validation failed:/);
    assert.ok(content.text.length < 1_024);
    assert.doesNotMatch(content.text, /VALEUR_SYNTHETIQUE_A_NE_PAS_RETOURNER|java\.|Exception|\bat .+\(.+:\d+\)/);
    assert.equal(result.structuredContent, undefined);
  });
}

test("refuse un outil inconnu par une erreur MCP structurée", async () => {
  await assert.rejects(client.callTool({ name: "outil_inconnu", arguments: {} }, undefined, timeout), (error) => {
    assert.ok(error instanceof McpError);
    assert.equal(error.code, ErrorCode.InvalidParams);
    assert.doesNotMatch(error.message, /java\.|Exception|\bat .+\(.+:\d+\)/);
    return true;
  });
});

test("termine la session et refuse sa réutilisation", async () => {
  const sessionId = transport.sessionId;
  assert.ok(sessionId);
  await transport.terminateSession();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-session-id": sessionId,
      "mcp-protocol-version": "2025-11-25",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: "after-close", method: "tools/list", params: {} }),
    signal: AbortSignal.timeout(5_000),
  });
  assert.equal(response.status, 404);
  await response.body?.cancel();
});
