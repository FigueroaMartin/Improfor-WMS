-- CreateTable
CREATE TABLE "HistorialAccion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "area" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "snapshot" TEXT NOT NULL,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
