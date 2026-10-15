-- CreateTable
CREATE TABLE "Pedido" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "oc" TEXT,
    "columnaDespacho" TEXT NOT NULL,
    "cliente" TEXT NOT NULL,
    "contacto" TEXT NOT NULL,
    "vendedor" TEXT NOT NULL,
    "documento" TEXT NOT NULL,
    "modoDespacho" TEXT NOT NULL,
    "situacionCobro" TEXT,
    "nuevo" BOOLEAN NOT NULL DEFAULT false,
    "motivoNC" TEXT,
    "guiaRecepcionada" BOOLEAN,
    "facturaNumero" TEXT,
    "facturaTotal" INTEGER,
    "facturaPagado" INTEGER,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Producto" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "pedidoId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "stock" INTEGER NOT NULL,
    "estado" TEXT NOT NULL,
    "preparado" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Producto_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrdenCompra" (
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
    "origenPedido" TEXT
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nombre" TEXT NOT NULL,
    "rol" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Aviso" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "area" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "pedidoId" TEXT,
    "leido" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
