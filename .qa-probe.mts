import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const job = await prisma.commerceIntelligenceJob.findUnique({ where: { id: "2bf0ca71-f1a4-4c2b-aaee-8cc3349372b4" }, select: { status: true, stage: true, publicErrorMessage: true, targetContentCount: true } });
const contents = await prisma.content.findMany({ where: { jobId: "2bf0ca71-f1a4-4c2b-aaee-8cc3349372b4" }, select: { id: true, position: true, status: true, currentBriefVersionId: true } });
console.log(JSON.stringify({ job, contentsCount: contents.length, contents }, null, 1).slice(0, 900));
await prisma.$disconnect();
