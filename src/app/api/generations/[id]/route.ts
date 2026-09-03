export const dynamic = "force-dynamic";
export const revalidate = 0;
import { handleGet } from "@/modules/commerce-intelligence/http-status";
export async function GET(req: Request, context: { params: Promise<{ id: string }> }) { return handleGet(req, (await context.params).id); }
