-- CreateTable
CREATE TABLE "PagoTramo" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ordenCompraId" TEXT NOT NULL,
    "etiqueta" TEXT NOT NULL,
    "monto" INTEGER NOT NULL,
    "pagado" BOOLEAN NOT NULL DEFAULT false,
    "fecha" DATETIME,
    "medio" TEXT,
    "comprobante" TEXT,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PagoTramo_ordenCompraId_fkey" FOREIGN KEY ("ordenCompraId") REFERENCES "OrdenCompra" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
