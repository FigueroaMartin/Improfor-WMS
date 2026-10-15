-- AlterTable
ALTER TABLE "Pedido" ADD COLUMN "adjuntos" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Producto" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "pedidoId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "stock" INTEGER NOT NULL,
    "estado" TEXT NOT NULL,
    "preparado" INTEGER NOT NULL DEFAULT 0,
    "actualizadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Producto_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Producto" ("cantidad", "estado", "id", "nombre", "pedidoId", "preparado", "sku", "stock") SELECT "cantidad", "estado", "id", "nombre", "pedidoId", "preparado", "sku", "stock" FROM "Producto";
DROP TABLE "Producto";
ALTER TABLE "new_Producto" RENAME TO "Producto";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
