import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
const prisma = new PrismaClient();
const token = randomBytes(32).toString("hex");
await prisma.session.create({ data: { userId: "a6912253-350e-455a-b640-5e95ea677c91", tenantId: "878cfd02-15b0-446e-9d71-31536cc3ff9e", tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 1800_000) } });
console.log("TOKEN=" + token);
await prisma.$disconnect();
