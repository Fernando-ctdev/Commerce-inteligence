import { handleGetProductHistory } from "@/modules/commerce-intelligence/history-cost";

type ProductRouteContext = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: ProductRouteContext) {
  const { id } = await params;
  return handleGetProductHistory(req, id);
}
