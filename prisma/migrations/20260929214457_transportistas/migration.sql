-- AlterTable
ALTER TABLE "OrdenCompra" ADD COLUMN "transportistaNombre" TEXT;

-- CreateTable
CREATE TABLE "Transportista" (
    "nombre" TEXT NOT NULL PRIMARY KEY,
    "tipo" TEXT NOT NULL,
    "urlRastreo" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true
);
