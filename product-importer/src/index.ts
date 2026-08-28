// Entrypoint do Product Importer (container único — ADR-016): HTTP API + Agent Runner
// + Browser Harness + Chromium headless + integração LLM. Stateless: sem banco.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { loadMode } from "./config.js";

const PORT = Number(process.env.PORT ?? 8091);

export function createApp(): Server {
  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
  });
}

export function main(): void {
  const mode = loadMode();
  createApp().listen(PORT, () => {
    // Log de boot sem segredos; budgets/config detalhados ficam em variáveis internas.
    console.log(JSON.stringify({ msg: "product-importer up", mode, port: PORT }));
  });
}

// Executa como processo; importado em testes apenas cria o app (sem escutar).
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop() ?? "")) {
  main();
}
