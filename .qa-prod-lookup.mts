
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const product = await prisma.product.findUnique({ where: { id: "40dc8762-872c-4645-8c93-94b846dd36e4" }, select: { id: true, name: true, lifecycle: true, targetContentCount: true, tenantId: true } });
console.log("PRODUCT=" + JSON.stringify(product));
if (product) {
  const users = await prisma.user.findMany({ where: { tenant: { id: product.tenantId } }, select: { id: true, email: true } });
  console.log("USERS=" + JSON.stringify(users));
  const jobs = await prisma.commerceIntelligenceJob.findMany({ where: { productId: product.id }, orderBy: { createdAt: "desc" }, take: 3, select: { id: true, status: true, stage: true, targetContentCount: true, createdAt: true } });
  console.log("JOBS=" + JSON.stringify(jobs));
}
await prisma.$disconnect();
