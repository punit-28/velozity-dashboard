import { PrismaClient } from '@prisma/client';

// Single shared Prisma instance (avoids exhausting DB connections in dev
// with ts-node-dev's module reload).
export const prisma = new PrismaClient();
