import { PrismaClient } from "../packages/database/node_modules/.prisma/client";
const p = new PrismaClient();
p.card.findMany({ where: { language: "ZH_TW" }, select: { webCardId: true }, take: 5 }).then(r => console.log(JSON.stringify(r))).catch(e => console.error(e.message)).finally(() => p["$disconnect"]());
