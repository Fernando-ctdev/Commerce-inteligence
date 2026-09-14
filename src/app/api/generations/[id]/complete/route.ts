import { handleCompleteMissing } from "@/modules/commerce-intelligence/http-status";
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) { return handleCompleteMissing(req, (await context.params).id); }
