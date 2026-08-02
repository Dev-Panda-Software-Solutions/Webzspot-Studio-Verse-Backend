
-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateTable
CREATE TABLE "SupportTicket" (
    "support_ticket_id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "raised_by_role" "Role" NOT NULL,
    "raised_by_name" TEXT NOT NULL,
    "isactive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("support_ticket_id")
);

-- CreateTable
CREATE TABLE "SupportTicketReply" (
    "support_ticket_reply_id" TEXT NOT NULL,
    "support_ticket_id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "responder_role" "Role" NOT NULL,
    "responder_name" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicketReply_pkey" PRIMARY KEY ("support_ticket_reply_id")
);

-- CreateIndex
CREATE INDEX "SupportTicket_createdBy_idx" ON "SupportTicket"("createdBy");

-- CreateIndex
CREATE INDEX "SupportTicket_status_idx" ON "SupportTicket"("status");

-- CreateIndex
CREATE INDEX "SupportTicketReply_support_ticket_id_idx" ON "SupportTicketReply"("support_ticket_id");

-- AddForeignKey
ALTER TABLE "SupportTicketReply" ADD CONSTRAINT "SupportTicketReply_support_ticket_id_fkey" FOREIGN KEY ("support_ticket_id") REFERENCES "SupportTicket"("support_ticket_id") ON DELETE RESTRICT ON UPDATE CASCADE;

