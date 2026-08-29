import {
  handleDeleteProduct,
  handleGetProduct,
  handleUpdateProduct,
} from "@/modules/products/http";

type ProductRouteContext = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: ProductRouteContext) {
  const { id } = await params;
  return handleGetProduct(req, id);
}

export async function PATCH(req: Request, { params }: ProductRouteContext) {
  const { id } = await params;
  return handleUpdateProduct(req, id);
}

export async function DELETE(req: Request, { params }: ProductRouteContext) {
  const { id } = await params;
  return handleDeleteProduct(req, id);
}
