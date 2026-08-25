// Testes comportamentais das guardas SSRF do enriquecimento (node:test, sem rede externa).
import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { guardedFetch, ipIsBlocked } from "./url-guard.js";
import { runEnrichment } from "./enrichment.js";

test("ipIsBlocked: loopback, privadas, link-local, multicast, reservadas e ULA IPv6", () => {
  for (const ip of ["127.0.0.1", "10.0.0.1", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "0.0.0.0", "224.0.0.1", "240.0.0.1", "255.255.255.255", "100.64.0.1", "198.18.0.1", "192.0.0.1"]) {
    assert.ok(ipIsBlocked(ip), `esperava bloquear ${ip}`);
  }
  for (const ip of ["::1", "::", "fe80::1", "fc00::1", "fd12::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1"]) {
    assert.ok(ipIsBlocked(ip), `esperava bloquear ${ip}`);
  }
  for (const ip of ["93.184.216.34", "1.1.1.1", "8.8.8.8", "2606:4700::1111"]) {
    assert.ok(!ipIsBlocked(ip), `não esperava bloquear ${ip}`);
  }
});

test("guardedFetch rejeita loopback mesmo com servidor local ouvindo", async () => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<html>ok</html>");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  try {
    const result = await guardedFetch(`http://127.0.0.1:${port}/`);
    assert.equal(result.kind, "unavailable");
    assert.equal(result.reason, "blocked-host"); // bloqueado antes de conectar
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test("guardedFetch rejeita esquema inválido e URL com credenciais", async () => {
  assert.deepEqual(await guardedFetch("ftp://exemplo.com"), { kind: "unavailable", reason: "invalid-url" });
  assert.deepEqual(await guardedFetch("https://u:p@exemplo.com"), { kind: "unavailable", reason: "invalid-url" });
});

test("runEnrichment com adapter fake: completed/unavailable e produto sem URL", async () => {
  const calls: string[] = [];
  const statuses: [string, string][] = [];
  const setStatus = async (id: string, s: string) => {
    statuses.push([id, s]);
  };
  const fakeOk = async (url: string) => {
    calls.push(url);
    return { kind: "completed" as const, mime: "text/html", text: "<html/>" };
  };
  const fakeFail = async () => ({ kind: "unavailable" as const, reason: "timeout" as const });

  assert.equal(await runEnrichment({ id: "p1", url: null }, fakeOk, setStatus), "unavailable"); // sem URL não tenta
  assert.deepEqual(calls, []);
  assert.equal(await runEnrichment({ id: "p1", url: "https://exemplo.com" }, fakeOk, setStatus), "completed");
  assert.deepEqual(calls, ["https://exemplo.com"]);
  assert.deepEqual(statuses, [["p1", "completed"]]);
  assert.equal(await runEnrichment({ id: "p2", url: "https://exemplo.com" }, fakeFail, setStatus), "unavailable");
  assert.deepEqual(statuses[1], ["p2", "unavailable"]);
});
