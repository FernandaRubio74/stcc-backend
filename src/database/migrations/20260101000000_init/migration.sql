-- ============================================================
-- Migracion inicial: users, projects, project_members
-- ============================================================

-- Enum de roles dentro de un proyecto
CREATE TYPE "ProjectRole" AS ENUM ('owner', 'editor', 'viewer');

-- ------------------------------------------------------------
-- Tabla: users
-- ------------------------------------------------------------
CREATE TABLE "users" (
    "id"             UUID NOT NULL,
    "email"          VARCHAR(255) NOT NULL,
    "password_hash"  VARCHAR(255),
    "full_name"      VARCHAR(150) NOT NULL,
    "auth_provider"  VARCHAR(30) NOT NULL DEFAULT 'local',
    "provider_id"    VARCHAR(255),
    "created_at"     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"     TIMESTAMPTZ NOT NULL,
    "created_by"     UUID,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "uq_user_provider" ON "users"("auth_provider", "provider_id");

ALTER TABLE "users"
    ADD CONSTRAINT "users_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ------------------------------------------------------------
-- Tabla: projects
-- ------------------------------------------------------------
CREATE TABLE "projects" (
    "id"          UUID NOT NULL,
    "name"        VARCHAR(150) NOT NULL,
    "description" TEXT,
    "is_private"  BOOLEAN NOT NULL DEFAULT true,
    "created_at"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMPTZ NOT NULL,
    "created_by"  UUID NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "projects"
    ADD CONSTRAINT "projects_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ------------------------------------------------------------
-- Tabla: project_members (resuelve N:M entre users y projects)
-- ------------------------------------------------------------
CREATE TABLE "project_members" (
    "id"          UUID NOT NULL,
    "user_id"     UUID NOT NULL,
    "project_id"  UUID NOT NULL,
    "role"        "ProjectRole" NOT NULL DEFAULT 'viewer',
    "created_at"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMPTZ NOT NULL,
    "created_by"  UUID,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_project_member" ON "project_members"("user_id", "project_id");

ALTER TABLE "project_members"
    ADD CONSTRAINT "project_members_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_members"
    ADD CONSTRAINT "project_members_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_members"
    ADD CONSTRAINT "project_members_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
