-- CreateEnum
CREATE TYPE "ApiSpecVersionStatus" AS ENUM ('DRAFT', 'APPROVED');

-- CreateTable
CREATE TABLE "api_spec_versions" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" "ApiSpecVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "endpoints" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "approved_at" TIMESTAMPTZ,
    "approved_by" UUID,

    CONSTRAINT "api_spec_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "api_spec_versions_project_id_status_idx" ON "api_spec_versions"("project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_api_spec_version" ON "api_spec_versions"("project_id", "version_number");

-- AddForeignKey
ALTER TABLE "api_spec_versions" ADD CONSTRAINT "api_spec_versions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_spec_versions" ADD CONSTRAINT "api_spec_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_spec_versions" ADD CONSTRAINT "api_spec_versions_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
