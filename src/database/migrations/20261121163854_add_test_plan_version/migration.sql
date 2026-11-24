-- CreateEnum
CREATE TYPE "TestPlanVersionStatus" AS ENUM ('DRAFT', 'APPROVED');

-- CreateTable
CREATE TABLE "test_plan_versions" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" "TestPlanVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "content" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "approved_at" TIMESTAMPTZ,
    "approved_by" UUID,

    CONSTRAINT "test_plan_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "test_plan_versions_project_id_status_idx" ON "test_plan_versions"("project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_test_plan_version" ON "test_plan_versions"("project_id", "version_number");

-- AddForeignKey
ALTER TABLE "test_plan_versions" ADD CONSTRAINT "test_plan_versions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_plan_versions" ADD CONSTRAINT "test_plan_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_plan_versions" ADD CONSTRAINT "test_plan_versions_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
