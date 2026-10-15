-- AlterTable
ALTER TABLE "OrdenCompra" ADD COLUMN "pospuestaHasta" DATETIME;
ALTER TABLE "OrdenCompra" ADD COLUMN "pospuestaMotivo" TEXT;

-- CreateTable
CREATE TABLE "Descuadre" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ordenCompraId" TEXT NOT NULL,
    "proveedor" TEXT NOT NULL,
    "producto" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "cantidadEsperada" INTEGER NOT NULL,
    "cantidadRecibida" INTEGER NOT NULL,
    "diferencia" INTEGER NOT NULL,
    "origenPedido" TEXT,
    "cerrado" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
