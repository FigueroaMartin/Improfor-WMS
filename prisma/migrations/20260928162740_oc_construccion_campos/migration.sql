-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_OrdenCompra" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "columna" TEXT NOT NULL,
    "proveedor" TEXT NOT NULL,
    "producto" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "monto" INTEGER NOT NULL,
    "condicionPago" TEXT,
    "modalidadPago" TEXT,
    "filaPago" TEXT,
    "tracking" TEXT,
    "warehouseReceipt" TEXT,
    "awb" TEXT,
    "origenPedido" TEXT,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "costoUnitario" INTEGER,
    "nota" TEXT
);
INSERT INTO "new_OrdenCompra" ("awb", "cantidad", "columna", "condicionPago", "filaPago", "id", "modalidadPago", "monto", "origenPedido", "producto", "proveedor", "tracking", "warehouseReceipt") SELECT "awb", "cantidad", "columna", "condicionPago", "filaPago", "id", "modalidadPago", "monto", "origenPedido", "producto", "proveedor", "tracking", "warehouseReceipt" FROM "OrdenCompra";
DROP TABLE "OrdenCompra";
ALTER TABLE "new_OrdenCompra" RENAME TO "OrdenCompra";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
