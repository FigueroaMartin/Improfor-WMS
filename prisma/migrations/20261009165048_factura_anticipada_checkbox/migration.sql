-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Pedido" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "oc" TEXT,
    "columnaDespacho" TEXT NOT NULL,
    "cliente" TEXT NOT NULL,
    "contacto" TEXT NOT NULL,
    "vendedor" TEXT NOT NULL,
    "documento" TEXT NOT NULL,
    "modoDespacho" TEXT NOT NULL,
    "situacionCobro" TEXT,
    "facturaAnticipada" BOOLEAN NOT NULL DEFAULT false,
    "nuevo" BOOLEAN NOT NULL DEFAULT false,
    "motivoNC" TEXT,
    "guiaRecepcionada" BOOLEAN,
    "facturaNumero" TEXT,
    "facturaTotal" INTEGER,
    "facturaPagado" INTEGER,
    "abonoMonto" INTEGER,
    "abonoFecha" DATETIME,
    "abonoNota" TEXT,
    "abonoRevisado" BOOLEAN NOT NULL DEFAULT false,
    "facturaAnticipadaNoMueveStock" BOOLEAN NOT NULL DEFAULT false,
    "facturaAnticipadaEnlazada" BOOLEAN NOT NULL DEFAULT false,
    "caratula" TEXT,
    "bultos" INTEGER,
    "fotoCapturada" BOOLEAN,
    "fotoDataUrl" TEXT,
    "medidas" TEXT,
    "peso" REAL,
    "otNumero" TEXT,
    "firmaCapturada" BOOLEAN,
    "direccionEntrega" TEXT,
    "comuna" TEXT,
    "telefonoContacto" TEXT,
    "numeroGuiaStarken" TEXT,
    "adjuntos" TEXT,
    "fotoGuiaRetiro" TEXT,
    "fotoEntregaRobinson" TEXT,
    "comentarioEntregaRobinson" TEXT,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" DATETIME NOT NULL
);
INSERT INTO "new_Pedido" ("abonoFecha", "abonoMonto", "abonoNota", "abonoRevisado", "actualizadoEn", "adjuntos", "bultos", "caratula", "cliente", "columnaDespacho", "comentarioEntregaRobinson", "comuna", "contacto", "creadoEn", "direccionEntrega", "documento", "facturaAnticipadaEnlazada", "facturaAnticipadaNoMueveStock", "facturaNumero", "facturaPagado", "facturaTotal", "firmaCapturada", "fotoCapturada", "fotoDataUrl", "fotoEntregaRobinson", "fotoGuiaRetiro", "guiaRecepcionada", "id", "medidas", "modoDespacho", "motivoNC", "nuevo", "numeroGuiaStarken", "oc", "otNumero", "peso", "situacionCobro", "telefonoContacto", "vendedor") SELECT "abonoFecha", "abonoMonto", "abonoNota", "abonoRevisado", "actualizadoEn", "adjuntos", "bultos", "caratula", "cliente", "columnaDespacho", "comentarioEntregaRobinson", "comuna", "contacto", "creadoEn", "direccionEntrega", "documento", "facturaAnticipadaEnlazada", "facturaAnticipadaNoMueveStock", "facturaNumero", "facturaPagado", "facturaTotal", "firmaCapturada", "fotoCapturada", "fotoDataUrl", "fotoEntregaRobinson", "fotoGuiaRetiro", "guiaRecepcionada", "id", "medidas", "modoDespacho", "motivoNC", "nuevo", "numeroGuiaStarken", "oc", "otNumero", "peso", "situacionCobro", "telefonoContacto", "vendedor" FROM "Pedido";
DROP TABLE "Pedido";
ALTER TABLE "new_Pedido" RENAME TO "Pedido";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
