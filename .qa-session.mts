
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
const prisma = new PrismaClient();
const token = randomBytes(32).toString("hex");
await prisma.session.create({ data: { userId: "4511533d-3bc1-411e-abe5-beee88afb4aa", tenantId: "98829984-26f4-4781-8bb2-257d278e328b", tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
console.log("TOKEN=" + token);
await prisma.$disconnect();
