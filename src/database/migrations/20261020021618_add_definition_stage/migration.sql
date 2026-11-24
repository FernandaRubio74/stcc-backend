-- CreateEnum
CREATE TYPE "DefinitionStage" AS ENUM ('PROBLEM_CONTEXT', 'TARGET_USERS_SCOPE');

-- CreateEnum
CREATE TYPE "DefinitionMessageRole" AS ENUM ('user', 'assistant');

-- CreateTable
CREATE TABLE "project_definitions" (
    "project_id" UUID NOT NULL,
    "current_stage" "DefinitionStage" NOT NULL DEFAULT 'PROBLEM_CONTEXT',
    "problem_summary" TEXT,
    "target_users" JSONB,
    "mvp_scope" JSONB,
    "user_journey" JSONB,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "project_definitions_pkey" PRIMARY KEY ("project_id")
);

-- CreateTable
CREATE TABLE "definition_messages" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "stage" "DefinitionStage" NOT NULL,
    "role" "DefinitionMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "definition_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocking_questions" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "stage" "DefinitionStage" NOT NULL,
    "question" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ,

    CONSTRAINT "blocking_questions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "definition_messages_project_id_created_at_idx" ON "definition_messages"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "blocking_questions_project_id_stage_resolved_at_idx" ON "blocking_questions"("project_id", "stage", "resolved_at");

-- AddForeignKey
ALTER TABLE "project_definitions" ADD CONSTRAINT "project_definitions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "definition_messages" ADD CONSTRAINT "definition_messages_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "definition_messages" ADD CONSTRAINT "definition_messages_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocking_questions" ADD CONSTRAINT "blocking_questions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
