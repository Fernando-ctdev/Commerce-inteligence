import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const job = await prisma.commerceIntelligenceJob.findUnique({ where: { id: "02e35a4b-1d47-4225-be7e-84c7d33a3923" }, select: { status: true, stage: true, publicErrorMessage: true } });
const contents = await prisma.content.count({ where: { jobId: "02e35a4b-1d47-4225-be7e-84c7d33a3923" } });
const rich = await prisma.product.findUnique({ where: { id: "74d297d7-23b9-40db-b53b-aade52c423c2" }, select: { name: true, lifecycle: true, targetContentCount: true } });
console.log(JSON.stringify({ job, contents, rich }));
await prisma.$disconnect();
