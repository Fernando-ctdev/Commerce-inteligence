import { handleGetLinkedContents } from "@/modules/products/http";

type ProductRouteContext = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: ProductRouteContext) {
  const { id } = await params;
  return handleGetLinkedContents(req, id);
}
