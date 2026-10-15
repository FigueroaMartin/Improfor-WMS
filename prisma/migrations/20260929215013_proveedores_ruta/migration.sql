-- CreateTable
CREATE TABLE "Proveedor" (
    "nombre" TEXT NOT NULL PRIMARY KEY,
    "condicionPago" TEXT,
    "ruta" TEXT NOT NULL DEFAULT 'Consolidado Miami'
);
