-- CreateTable
CREATE TABLE "ProductoMaestro" (
    "sku" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "proveedor" TEXT,
    "stockActual" INTEGER NOT NULL DEFAULT 0,
    "minimo" INTEGER,
    "maximo" INTEGER
);
