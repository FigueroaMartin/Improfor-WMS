-- CreateTable
CREATE TABLE "PosponerCompra" (
    "proveedor" TEXT NOT NULL PRIMARY KEY,
    "motivo" TEXT NOT NULL,
    "fechaReevaluar" DATETIME,
    "nota" TEXT,
    "autor" TEXT,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
