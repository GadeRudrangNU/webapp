/*
  Warnings:

  - A unique constraint covering the columns `[verification_token]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "email_verified_at" TIMESTAMP(3),
ADD COLUMN     "verification_token" TEXT,
ADD COLUMN     "verification_token_created" TIMESTAMP(3),
ALTER COLUMN "is_verified" SET DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "User_verification_token_key" ON "User"("verification_token");
