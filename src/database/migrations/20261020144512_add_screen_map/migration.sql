-- CreateTable
CREATE TABLE "screen_maps" (
    "project_id" UUID NOT NULL,
    "screens" JSONB NOT NULL,
    "navigation" JSONB NOT NULL,
    "diagram" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID,

    CONSTRAINT "screen_maps_pkey" PRIMARY KEY ("project_id")
);

-- AddForeignKey
ALTER TABLE "screen_maps" ADD CONSTRAINT "screen_maps_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screen_maps" ADD CONSTRAINT "screen_maps_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
