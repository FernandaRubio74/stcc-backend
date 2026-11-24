-- CreateTable
CREATE TABLE "project_architectures" (
    "project_id" UUID NOT NULL,
    "recommended_id" TEXT,
    "justification" TEXT,
    "selected_id" TEXT,
    "selected_at" TIMESTAMPTZ,
    "selected_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "project_architectures_pkey" PRIMARY KEY ("project_id")
);

-- AddForeignKey
ALTER TABLE "project_architectures" ADD CONSTRAINT "project_architectures_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_architectures" ADD CONSTRAINT "project_architectures_selected_by_fkey" FOREIGN KEY ("selected_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
