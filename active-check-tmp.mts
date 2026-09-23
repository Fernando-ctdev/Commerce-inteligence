import "./src/modules/env-loader";
import { prisma } from "./src/modules/db";
const actives = await prisma.commerceIntelligenceJob.findMany({ where: { tenantId: "878cfd02-15b0-446e-9d71-31536cc3ff9e", status: { in: ["QUEUED", "RUNNING"] } }, select: { id: true, status: true, stage: true, productId: true, createdAt: true } });
console.log(JSON.stringify(actives, null, 1));
await prisma.$disconnect();
