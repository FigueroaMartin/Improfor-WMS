-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Pedido" (
    "id" TEXT NOT NULL,
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
    "abonoFecha" TIMESTAMP(3),
    "abonoNota" TEXT,
    "abonoRevisado" BOOLEAN NOT NULL DEFAULT false,
    "facturaAnticipadaNoMueveStock" BOOLEAN NOT NULL DEFAULT false,
    "facturaAnticipadaEnlazada" BOOLEAN NOT NULL DEFAULT false,
    "caratula" TEXT,
    "bultos" INTEGER,
    "fotoCapturada" BOOLEAN,
    "fotoDataUrl" TEXT,
    "medidas" TEXT,
    "peso" DOUBLE PRECISION,
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
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Producto" (
    "id" SERIAL NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "stock" INTEGER NOT NULL,
    "estado" TEXT NOT NULL,
    "preparado" INTEGER NOT NULL DEFAULT 0,
    "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receta" TEXT,
    "transformado" BOOLEAN NOT NULL DEFAULT false,
    "motivoIncompleto" TEXT,
    "proveedor" TEXT,

    CONSTRAINT "Producto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrdenCompra" (
    "id" TEXT NOT NULL,
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
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "costoUnitario" INTEGER,
    "nota" TEXT,
    "transportistaNombre" TEXT,
    "cargaId" TEXT,
    "pospuestaHasta" TIMESTAMP(3),
    "pospuestaMotivo" TEXT,

    CONSTRAINT "OrdenCompra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Descuadre" (
    "id" SERIAL NOT NULL,
    "ordenCompraId" TEXT NOT NULL,
    "proveedor" TEXT NOT NULL,
    "producto" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "cantidadEsperada" INTEGER NOT NULL,
    "cantidadRecibida" INTEGER NOT NULL,
    "diferencia" INTEGER NOT NULL,
    "origenPedido" TEXT,
    "cerrado" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Descuadre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Carga" (
    "id" TEXT NOT NULL,
    "columna" TEXT NOT NULL DEFAULT 'transito_miami',
    "warehouseReceipt" TEXT,
    "awb" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Carga_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proveedor" (
    "nombre" TEXT NOT NULL,
    "condicionPago" TEXT,
    "ruta" TEXT NOT NULL DEFAULT 'Consolidado Miami',

    CONSTRAINT "Proveedor_pkey" PRIMARY KEY ("nombre")
);

-- CreateTable
CREATE TABLE "PosponerCompra" (
    "proveedor" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "fechaReevaluar" TIMESTAMP(3),
    "nota" TEXT,
    "autor" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosponerCompra_pkey" PRIMARY KEY ("proveedor")
);

-- CreateTable
CREATE TABLE "CuentaPorPagar" (
    "id" SERIAL NOT NULL,
    "ordenCompraId" TEXT NOT NULL,
    "proveedor" TEXT NOT NULL,
    "modalidad" TEXT NOT NULL,
    "facturaNumero" TEXT NOT NULL,
    "facturaFechaEmision" TIMESTAMP(3) NOT NULL,
    "monto" INTEGER NOT NULL,
    "montoPagado" INTEGER NOT NULL DEFAULT 0,
    "fechaVencimiento" TIMESTAMP(3),
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "medioPago" TEXT,
    "numeroOperacion" TEXT,
    "comprobante" TEXT,
    "fechaPago" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CuentaPorPagar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductoMaestro" (
    "sku" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "proveedor" TEXT,
    "stockActual" INTEGER NOT NULL DEFAULT 0,
    "minimo" INTEGER,
    "maximo" INTEGER,

    CONSTRAINT "ProductoMaestro_pkey" PRIMARY KEY ("sku")
);

-- CreateTable
CREATE TABLE "Vendedor" (
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Vendedor_pkey" PRIMARY KEY ("nombre")
);

-- CreateTable
CREATE TABLE "Transportista" (
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "urlRastreo" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Transportista_pkey" PRIMARY KEY ("nombre")
);

-- CreateTable
CREATE TABLE "PagoTramo" (
    "id" SERIAL NOT NULL,
    "ordenCompraId" TEXT NOT NULL,
    "etiqueta" TEXT NOT NULL,
    "monto" INTEGER NOT NULL,
    "pagado" BOOLEAN NOT NULL DEFAULT false,
    "fecha" TIMESTAMP(3),
    "medio" TEXT,
    "comprobante" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PagoTramo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "nombre" TEXT NOT NULL,
    "diasFacturacion" INTEGER,
    "modalidadFacturacion" TEXT,
    "contactoComprador" TEXT,
    "contactoPagos" TEXT,
    "documentoPreferido" TEXT,
    "modoDespachoPreferido" TEXT,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("nombre")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "rol" TEXT NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Aviso" (
    "id" SERIAL NOT NULL,
    "area" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "pedidoId" TEXT,
    "leido" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Aviso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistorialAccion" (
    "id" SERIAL NOT NULL,
    "area" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "snapshot" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistorialAccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recordatorio" (
    "id" SERIAL NOT NULL,
    "area" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "autor" TEXT,
    "resuelto" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recordatorio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cacho" (
    "id" SERIAL NOT NULL,
    "area" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "autor" TEXT,
    "pedidoId" TEXT,
    "resuelto" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cacho_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CachoComentario" (
    "id" SERIAL NOT NULL,
    "cachoId" INTEGER NOT NULL,
    "autor" TEXT,
    "texto" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CachoComentario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CuentaPorPagar_ordenCompraId_key" ON "CuentaPorPagar"("ordenCompraId");

-- AddForeignKey
ALTER TABLE "Producto" ADD CONSTRAINT "Producto_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenCompra" ADD CONSTRAINT "OrdenCompra_cargaId_fkey" FOREIGN KEY ("cargaId") REFERENCES "Carga"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoTramo" ADD CONSTRAINT "PagoTramo_ordenCompraId_fkey" FOREIGN KEY ("ordenCompraId") REFERENCES "OrdenCompra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CachoComentario" ADD CONSTRAINT "CachoComentario_cachoId_fkey" FOREIGN KEY ("cachoId") REFERENCES "Cacho"("id") ON DELETE CASCADE ON UPDATE CASCADE;

