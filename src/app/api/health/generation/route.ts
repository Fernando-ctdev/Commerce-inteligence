import { generationHealth } from "@/modules/commerce-intelligence/runtime";
export function GET() { return Response.json(generationHealth(), { headers: { "cache-control": "no-store" } }); }
