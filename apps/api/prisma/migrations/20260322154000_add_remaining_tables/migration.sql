-- This migration adds all tables created since the initial migration (20260321080312_init).
-- Uses IF NOT EXISTS for safety in case tables were created via db push in dev.

-- AlterTable: add unique constraint to namespaces.kestraNamespace
DO $$ BEGIN
  ALTER TABLE "namespaces" ADD CONSTRAINT "namespaces_kestraNamespace_key" UNIQUE ("kestraNamespace");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "workflow_drafts" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "nodes" JSONB NOT NULL,
    "edges" JSONB NOT NULL,
    "inputs" JSONB NOT NULL,
    "variables" JSONB NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "workflow_releases" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "nodes" JSONB NOT NULL,
    "edges" JSONB NOT NULL,
    "inputs" JSONB NOT NULL,
    "variables" JSONB NOT NULL,
    "yaml" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "workflow_draft_executions" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "kestraExecId" TEXT NOT NULL,
    "nodes" JSONB NOT NULL,
    "edges" JSONB NOT NULL,
    "inputs" JSONB NOT NULL,
    "variables" JSONB NOT NULL,
    "inputValues" JSONB NOT NULL DEFAULT '{}',
    "state" TEXT NOT NULL,
    "taskRuns" JSONB NOT NULL DEFAULT '[]',
    "triggeredBy" TEXT NOT NULL DEFAULT 'manual',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_draft_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "workflow_executions" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "kestraExecId" TEXT NOT NULL,
    "inputValues" JSONB NOT NULL DEFAULT '{}',
    "state" TEXT NOT NULL,
    "taskRuns" JSONB NOT NULL DEFAULT '[]',
    "triggeredBy" TEXT NOT NULL DEFAULT 'manual',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "workflow_triggers" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "inputs" JSONB NOT NULL DEFAULT '{}',
    "kestraFlowId" TEXT NOT NULL,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_triggers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "variables" (
    "id" TEXT NOT NULL,
    "namespaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "variables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "secrets" (
    "id" TEXT NOT NULL,
    "namespaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "secrets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "workflow_drafts_workflowId_createdAt_idx" ON "workflow_drafts"("workflowId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_releases_workflowId_version_key" ON "workflow_releases"("workflowId", "version");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "workflow_releases_workflowId_version_idx" ON "workflow_releases"("workflowId", "version" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "workflow_draft_executions_workflowId_createdAt_idx" ON "workflow_draft_executions"("workflowId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "workflow_executions_workflowId_createdAt_idx" ON "workflow_executions"("workflowId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "workflow_executions_releaseId_idx" ON "workflow_executions"("releaseId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "workflow_triggers_workflowId_idx" ON "workflow_triggers"("workflowId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "variables_namespaceId_key_key" ON "variables"("namespaceId", "key");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "secrets_namespaceId_key_key" ON "secrets"("namespaceId", "key");

DO $$ BEGIN
  ALTER TABLE "workflow_drafts" ADD CONSTRAINT "workflow_drafts_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "workflow_releases" ADD CONSTRAINT "workflow_releases_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "workflow_draft_executions" ADD CONSTRAINT "workflow_draft_executions_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "workflow_releases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "workflow_triggers" ADD CONSTRAINT "workflow_triggers_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "variables" ADD CONSTRAINT "variables_namespaceId_fkey" FOREIGN KEY ("namespaceId") REFERENCES "namespaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "secrets" ADD CONSTRAINT "secrets_namespaceId_fkey" FOREIGN KEY ("namespaceId") REFERENCES "namespaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
