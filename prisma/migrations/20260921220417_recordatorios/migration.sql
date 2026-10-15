-- CreateTable
CREATE TABLE "Recordatorio" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "area" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "autor" TEXT,
    "resuelto" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
