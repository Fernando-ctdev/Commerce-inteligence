import { handleReactivateProduct } from "@/modules/products/http";

type ProductRouteContext = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: ProductRouteContext) {
  const { id } = await params;
  return handleReactivateProduct(req, id);
}
