const { prisma } = require("../src/db");

afterAll(async () => {
    try {
        await prisma.$disconnect();
    } catch (_) {
        // ignore
    }
});
