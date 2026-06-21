-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('SENT', 'OPENED', 'CLICKED');

-- AlterTable
ALTER TABLE "Participant" ADD COLUMN "emailStatus" "EmailStatus" NOT NULL DEFAULT 'SENT';
