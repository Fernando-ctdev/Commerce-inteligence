import { prisma } from "../src/modules/db";
import { resolveSession } from "../src/modules/identity/service";
const month = new Date().toISOString().slice(0, 7);
const jobs = await prisma.commerceIntelligenceJob.findMany({ where: { status: { in: ["QUEUED", "RUNNING"] } }, select: { id: true, tenantId: true, userId: true, productId: true, status: true, stage: true, attempt: true, leaseOwnerId: true, leaseDeadlineAt: true, nextAttemptAt: true }, orderBy: { createdAt: "desc" } });
const reservations = await prisma.generationUsageReservation.findMany({ where: { generatedContentsMonth: month, status: { in: ["RESERVED", "CONFIRMED"] } }, select: { jobId: true, tenantId: true, quantity: true, status: true, generatedContentsMonth: true } });
console.log(JSON.stringify({ month, configuredLimit: Number.isInteger(Number(process.env.GENERATED_CONTENTS_MONTH_LIMIT)) ? Number(process.env.GENERATED_CONTENTS_MONTH_LIMIT) : null, jobs, reservations, total: reservations.reduce((sum, item) => sum + item.quantity, 0) }, null, 2));
const token = process.env.SESSION_TOKEN;
if (token) console.log(JSON.stringify({ session: await resolveSession(token) }, null, 2));
await prisma.$disconnect();
