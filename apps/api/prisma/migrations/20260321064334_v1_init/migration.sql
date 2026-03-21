-- CreateTable
CREATE TABLE "namespaces" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "kestraNamespace" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "workflows" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "namespaceId" TEXT NOT NULL,
    "description" TEXT,
    "nodes" JSONB NOT NULL DEFAULT [],
    "edges" JSONB NOT NULL DEFAULT [],
    "inputs" JSONB NOT NULL DEFAULT [],
    "variables" JSONB NOT NULL DEFAULT [],
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "publishedVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "workflows_namespaceId_fkey" FOREIGN KEY ("namespaceId") REFERENCES "namespaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "workflows_namespaceId_flowId_key" ON "workflows"("namespaceId", "flowId");
