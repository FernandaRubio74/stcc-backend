/*
  Warnings:

  - You are about to drop the `screen_maps` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "ScreenMapVersionStatus" AS ENUM ('DRAFT', 'APPROVED');

-- DropForeignKey
ALTER TABLE "screen_maps" DROP CONSTRAINT "screen_maps_created_by_fkey";

-- DropForeignKey
ALTER TABLE "screen_maps" DROP CONSTRAINT "screen_maps_project_id_fkey";

-- DropTable
DROP TABLE "screen_maps";

-- CreateTable
CREATE TABLE "screen_map_versions" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" "ScreenMapVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "screens" JSONB NOT NULL,
    "navigation" JSONB NOT NULL,
    "diagram" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "approved_at" TIMESTAMPTZ,
    "approved_by" UUID,

    CONSTRAINT "screen_map_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "screen_map_versions_project_id_status_idx" ON "screen_map_versions"("project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_screen_map_version" ON "screen_map_versions"("project_id", "version_number");

-- AddForeignKey
ALTER TABLE "screen_map_versions" ADD CONSTRAINT "screen_map_versions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screen_map_versions" ADD CONSTRAINT "screen_map_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screen_map_versions" ADD CONSTRAINT "screen_map_versions_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
