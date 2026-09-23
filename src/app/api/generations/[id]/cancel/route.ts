import { handleCancel } from "@/modules/commerce-intelligence/http-status";
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) { return handleCancel(req, (await context.params).id); }
