const { PrismaClient } = require("@prisma/client");
const { recordDbTiming } = require("./utils/metrics");

const basePrisma = new PrismaClient();

const prisma = basePrisma.$extends({
    query: {
        $allModels: {
            async $allOperations({ model, operation, args, query }) {
                const start = Date.now();

                try {
                    return await query(args);
                } finally {
                    const durationMs = Date.now() - start;
                    const operationName = `${model || "unknown"}.${operation || "query"}`;
                    recordDbTiming(operationName, durationMs);
                }
            },
        },
    },
});

module.exports = { prisma };