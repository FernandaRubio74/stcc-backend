-- CreateEnum
CREATE TYPE "GeneratedDocumentKind" AS ENUM ('SPEC', 'ARCHITECTURE');

-- CreateTable
CREATE TABLE "generated_documents" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "kind" "GeneratedDocumentKind" NOT NULL,
    "version_number" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "generated_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "generated_documents_project_id_kind_idx" ON "generated_documents"("project_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "uq_generated_document_version" ON "generated_documents"("project_id", "kind", "version_number");

-- AddForeignKey
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
