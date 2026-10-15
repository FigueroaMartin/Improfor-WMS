-- CreateTable
CREATE TABLE "CuentaPorPagar" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ordenCompraId" TEXT NOT NULL,
    "proveedor" TEXT NOT NULL,
    "modalidad" TEXT NOT NULL,
    "facturaNumero" TEXT NOT NULL,
    "facturaFechaEmision" DATETIME NOT NULL,
    "monto" INTEGER NOT NULL,
    "montoPagado" INTEGER NOT NULL DEFAULT 0,
    "fechaVencimiento" DATETIME,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "medioPago" TEXT,
    "numeroOperacion" TEXT,
    "comprobante" TEXT,
    "fechaPago" DATETIME,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "CuentaPorPagar_ordenCompraId_key" ON "CuentaPorPagar"("ordenCompraId");
