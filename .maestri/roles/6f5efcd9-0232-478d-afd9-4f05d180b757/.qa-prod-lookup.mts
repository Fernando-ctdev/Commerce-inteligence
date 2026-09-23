
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const product = await prisma.product.findUnique({ where: { id: "40dc8762-872c-4645-8c93-94b846dd36e4" }, select: { id: true, name: true, lifecycle: true, targetContentCount: true, tenantId: true, userId: true } });
console.log("PRODUCT=" + JSON.stringify(product));
if (product) {
  const user = await prisma.user.findUnique({ where: { id: product.userId }, select: { id: true, email: true, tenantId: true } });
  console.log("USER=" + JSON.stringify(user));
  const jobs = await prisma.commerceIntelligenceJob.findMany({ where: { productId: product.id }, orderBy: { createdAt: "desc" }, take: 3, select: { id: true, status: true, stage: true, targetContentCount: true, createdAt: true } });
  console.log("JOBS=" + JSON.stringify(jobs));
}
await prisma.$disconnect();
