import { handleArchiveProduct } from "@/modules/products/http";

type ProductRouteContext = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: ProductRouteContext) {
  const { id } = await params;
  return handleArchiveProduct(req, id);
}
