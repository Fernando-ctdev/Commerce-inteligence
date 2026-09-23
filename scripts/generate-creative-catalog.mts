import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const catalogPath = path.join(root, "resources/system-knowledge/catalog/catalog.json");
const sources = {
  "virais-baratinhos.pdf": "resources/system-knowledge/hooks/virais-baratinhos.pdf",
  "vestuario-feminino-masculino.pdf": "resources/system-knowledge/hooks/vestuario-feminino-masculino.pdf",
  "ctas-tiktok-shop.pdf": "resources/system-knowledge/ctas/ctas-tiktok-shop.pdf",
};
const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as {
  version: string;
  items: Array<{ id: string; source: string; text: string; [key: string]: unknown }>;
};
const sourceEntries = new Map<string, Map<number, string>>();

for (const [source, relativePath] of Object.entries(sources)) {
  const extracted = execFileSync(
    "pdftotext",
    ["-enc", "UTF-8", path.join(root, relativePath), "-"],
    { encoding: "utf8", maxBuffer: 5 * 1024 * 1024 },
  );
  if (extracted.includes("\uFFFD")) throw new Error(`${source}: PDF extraction contains replacement characters`);

  const cleanText = extracted
    .replace(/\f/g, "\n")
    .replace(/^.*(?:100 Ganchos|50 Ganchos|100 CTAs).*$/gm, "");
  const entries = new Map<number, string>();
  for (const match of cleanText.matchAll(/(?<!\d)(\d{1,3})\.\s+([\s\S]*?)(?=\s+\d{1,3}\.\s+|$)/gu)) {
    const number = Number(match[1]);
    if (number < 1 || number > 100) continue;
    if (entries.has(number)) throw new Error(`${source}: duplicate item ${number}`);
    entries.set(number, normalize(match[2]));
  }
  if (entries.size !== 100) throw new Error(`${source}: expected 100 numbered entries, found ${entries.size}`);
  sourceEntries.set(source, entries);
}

let updated = 0;
for (const item of catalog.items) {
  const entries = sourceEntries.get(item.source);
  const number = Number(item.id.match(/(\d+)$/)?.[1]);
  const text = entries?.get(number);
  if (!text) throw new Error(`${item.id}: no matching source text`);

  // Only recover replacement characters and PDF ellipsis normalization; refuse semantic edits.
  const previous = normalize(item.text).replace(/\.\.\./g, "…");
  const equivalent = new RegExp(`^${escapeRegExp(previous).replace(/\uFFFD/g, ".")}$`, "u");
  if (!equivalent.test(text)) throw new Error(`${item.id}: source differs beyond encoding/punctuation repair`);
  if (item.text !== text) updated++;
  item.text = text;
}

const serialized = `${JSON.stringify(catalog, null, 2)}\n`;
JSON.parse(serialized);
if (serialized.includes("\uFFFD")) throw new Error("Generated catalog still contains replacement characters");
writeFileSync(catalogPath, serialized, { encoding: "utf8" });
console.log(`Generated ${catalog.items.length} catalog entries from UTF-8 PDF extraction (${updated} text fields repaired).`);
