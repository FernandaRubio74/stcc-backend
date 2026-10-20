-- CreateEnum
CREATE TYPE "DataModelVersionStatus" AS ENUM ('DRAFT', 'APPROVED');

-- CreateTable
CREATE TABLE "data_model_versions" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" "DataModelVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "entities" JSONB NOT NULL,
    "diagram" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "approved_at" TIMESTAMPTZ,
    "approved_by" UUID,

    CONSTRAINT "data_model_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "data_model_versions_project_id_status_idx" ON "data_model_versions"("project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_data_model_version" ON "data_model_versions"("project_id", "version_number");

-- AddForeignKey
ALTER TABLE "data_model_versions" ADD CONSTRAINT "data_model_versions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_model_versions" ADD CONSTRAINT "data_model_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_model_versions" ADD CONSTRAINT "data_model_versions_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
