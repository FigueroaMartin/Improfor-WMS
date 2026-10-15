// Mismos datos de prueba de la maqueta Fase 1 (maqueta/store.js), ahora
// como semilla de la base de datos real.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.historialAccion.deleteMany(); // referencia IDs de Producto que van a cambiar
  await prisma.producto.deleteMany();
  await prisma.pedido.deleteMany();
  await prisma.descuadre.deleteMany();
  await prisma.cuentaPorPagar.deleteMany();
  await prisma.vendedor.deleteMany();
  await prisma.posponerCompra.deleteMany();
  await prisma.ordenCompra.deleteMany();
  await prisma.carga.deleteMany();
  await prisma.productoMaestro.deleteMany();
  await prisma.transportista.deleteMany();
  await prisma.proveedor.deleteMany();
  await prisma.usuario.deleteMany();
  await prisma.aviso.deleteMany();
  await prisma.cacho.deleteMany(); // cascada borra CachoComentario

  const pedidos = [
    {
      id: "PED-10432",
      oc: null,
      columnaDespacho: "ingreso",
      cliente: "Bomberos de Providencia",
      contacto: "Cap. Rodrigo Fuentes",
      vendedor: "Ana Silva",
      documento: "Guía de despacho",
      modoDespacho: "Starken",
      situacionCobro: null,
      nuevo: true,
      // Dirección/comuna/teléfono del destinatario vienen con el pedido
      // desde Laudus (igual que cliente/contacto/productos) — Bodega no
      // los pide a mano, solo los usa para la etiqueta.
      direccionEntrega: "Av. Pedro de Valdivia 1550",
      comuna: "Providencia",
      telefonoContacto: "+56 9 8812 3344",
      productos: [
        { sku: "CAS-INC-04", nombre: "Casco estructural F4", cantidad: 6, stock: 9, estado: "ok", preparado: 0 },
        { sku: "GUA-VIS-M", nombre: "Guante Vision talla M", cantidad: 12, stock: 4, estado: "falta", preparado: 0, proveedor: "SafetyPro Chile" },
      ],
    },
    {
      id: "PED-10419",
      oc: "OC-2277",
      columnaDespacho: "salida_bodega",
      cliente: "Constructora Vimasa",
      contacto: "Jorge Núñez",
      vendedor: "Diego Ortiz",
      documento: "Factura",
      modoDespacho: "Cliente retira",
      situacionCobro: "Pendiente de pago",
      facturaNumero: "F-8821",
      facturaTotal: 1180000,
      facturaPagado: 0,
      nuevo: true,
      productos: [{ sku: "EXT-PQS-6K", nombre: "Extintor PQS 6kg", cantidad: 20, stock: 20, estado: "ok", preparado: 0 }],
    },
    {
      id: "PED-10405",
      oc: "OC-2260",
      columnaDespacho: "despacho",
      cliente: "Hospital Regional",
      contacto: "Marcela Toro",
      vendedor: "Ana Silva",
      documento: "Guía de despacho",
      modoDespacho: "Robinson",
      situacionCobro: null,
      facturaAnticipada: true,
      nuevo: false,
      productos: [{ sku: "GEN-GUANTE", nombre: "Guante (genérico — falta talla/color)", cantidad: 8, stock: 0, estado: "bloqueado", preparado: 0 }],
    },
    {
      id: "PED-10460",
      oc: null,
      columnaDespacho: "despacho",
      cliente: "Cuartel Bomberos La Reina",
      contacto: "Tte. Paula Rojas",
      vendedor: "Diego Ortiz",
      documento: "Guía de despacho",
      modoDespacho: "Chilexpress",
      situacionCobro: null,
      nuevo: false,
      productos: [
        {
          sku: "BOL-TRAUMA",
          nombre: "Bolso de trauma con insumos",
          cantidad: 5,
          stock: 0,
          estado: "ok",
          preparado: 0,
          receta: JSON.stringify([
            { sku: "BOL-BASE", nombre: "Bolso base", cantidadPorUnidad: 1, stockDisponible: 10 },
            { sku: "KIT-INS", nombre: "Kit de insumos", cantidadPorUnidad: 1, stockDisponible: 3 },
          ]),
        },
      ],
    },
    {
      id: "PED-10390",
      oc: "OC-2248",
      columnaDespacho: "salida_bodega",
      cliente: "Salmones Austral",
      contacto: "Iván Cárcamo",
      vendedor: "Diego Ortiz",
      documento: "Factura",
      modoDespacho: "Starken(Sendu)",
      numeroGuiaStarken: "SENDU-OT-55214",
      situacionCobro: null,
      direccionEntrega: "Camino a Melipilla 8200",
      comuna: "Maipú",
      telefonoContacto: "+56 9 7765 4321",
      nuevo: false,
      productos: [
        { sku: "TRA-EPP-01", nombre: "Traje EPP nivel B", cantidad: 4, stock: 4, estado: "ok", preparado: 4 },
        { sku: "BOT-IND-42", nombre: "Botas industriales 42", cantidad: 4, stock: 4, estado: "ok", preparado: 3 },
      ],
    },
    {
      id: "PED-10381",
      oc: "OC-2231",
      columnaDespacho: "despacho",
      cliente: "Municipalidad de Ñuñoa",
      contacto: "Felipe Aros",
      vendedor: "Ana Silva",
      documento: "Guía de despacho",
      modoDespacho: "Chilexpress",
      situacionCobro: null,
      nuevo: false,
      productos: [{ sku: "SEN-HUM-01", nombre: "Sensor de humo interconectado", cantidad: 30, stock: 30, estado: "ok", preparado: 30 }],
    },
    {
      id: "PED-10375",
      oc: "OC-2219",
      columnaDespacho: "entregado",
      cliente: "Retail Sodimac Temuco",
      contacto: "Carla Mena",
      vendedor: "Diego Ortiz",
      documento: "Factura",
      modoDespacho: "Starken",
      situacionCobro: null,
      direccionEntrega: "Av. Alemania 0671",
      comuna: "Temuco",
      telefonoContacto: "+56 9 5544 3322",
      nuevo: false,
      productos: [{ sku: "EXT-CO2-5K", nombre: "Extintor CO2 5kg", cantidad: 15, stock: 15, estado: "ok", preparado: 15 }],
    },
    {
      id: "PED-10360",
      oc: null,
      columnaDespacho: "en_transito",
      cliente: "Retail Sodimac Puente Alto",
      contacto: "Carla Mena",
      vendedor: "Diego Ortiz",
      documento: "Factura",
      modoDespacho: "Starken",
      situacionCobro: "Pendiente de pago",
      facturaNumero: "F-8790",
      facturaTotal: 2450000,
      facturaPagado: 1200000,
      direccionEntrega: "Av. Concha y Toro 4500",
      comuna: "Puente Alto",
      telefonoContacto: "+56 9 6611 2233",
      nuevo: false,
      productos: [{ sku: "VAR-001", nombre: "Surtido EPP", cantidad: 1, stock: 1, estado: "ok", preparado: 1 }],
    },
    {
      id: "PED-10344",
      oc: null,
      columnaDespacho: "listo_retiro",
      caratula: "M",
      bultos: 1,
      fotoCapturada: true,
      cliente: "Distribuidora Sur Ltda.",
      contacto: "Rodrigo Paz",
      vendedor: "Diego Ortiz",
      documento: "Guía de despacho",
      modoDespacho: "Robinson",
      situacionCobro: null,
      guiaRecepcionada: false,
      nuevo: false,
      productos: [{ sku: "VAR-002", nombre: "Surtido señalética", cantidad: 1, stock: 1, estado: "ok", preparado: 1 }],
    },
    {
      id: "PED-10470",
      oc: null,
      columnaDespacho: "en_transito",
      caratula: "P",
      bultos: 1,
      fotoCapturada: true,
      cliente: "Ferretería El Roble",
      contacto: "Nicolás Vera",
      vendedor: "Ana Silva",
      documento: "Guía de despacho",
      modoDespacho: "Robinson",
      situacionCobro: null,
      guiaRecepcionada: false,
      direccionEntrega: "Av. Vicuña Mackenna 4820",
      comuna: "La Florida",
      nuevo: false,
      productos: [{ sku: "VAR-003", nombre: "Surtido EPI básico", cantidad: 1, stock: 1, estado: "ok", preparado: 1 }],
    },
    // Dos pedidos frescos en "Ingreso", sin complicaciones (stock OK, sin
    // abono), para probar el flujo completo de clasificación + cierre con
    // Starken normal y con Starken(Sendu) una al lado de la otra.
    {
      id: "PED-10501",
      oc: null,
      columnaDespacho: "ingreso",
      cliente: "Clínica Vida Sana",
      contacto: "Paula Reyes",
      vendedor: "Ana Silva",
      documento: "Guía de despacho",
      modoDespacho: "Starken",
      situacionCobro: null,
      direccionEntrega: "Av. Larraín 7500",
      comuna: "La Reina",
      telefonoContacto: "+56 9 4433 2211",
      nuevo: true,
      productos: [{ sku: "EXT-PQS-6K", nombre: "Extintor PQS 6kg", cantidad: 2, stock: 10, estado: "ok", preparado: 0 }],
    },
    {
      id: "PED-10502",
      oc: null,
      columnaDespacho: "ingreso",
      cliente: "Minimarket El Trébol",
      contacto: "Jorge Tapia",
      vendedor: "Diego Ortiz",
      documento: "Guía de despacho",
      modoDespacho: "Starken(Sendu)",
      situacionCobro: null,
      direccionEntrega: "Pasaje Los Aromos 230",
      comuna: "Quilicura",
      telefonoContacto: "+56 9 3322 1100",
      nuevo: true,
      productos: [{ sku: "SEN-HUM-01", nombre: "Sensor de humo interconectado", cantidad: 3, stock: 15, estado: "ok", preparado: 0 }],
    },
    // Ya clasificado y con lo pedido completo — directo a "Por preparar" en
    // Bodega, sin tener que pasar primero por Despacho, para probar rápido
    // el cierre + "Generar etiqueta (Starken)" contra la API real (QA).
    {
      id: "PED-10503",
      oc: null,
      columnaDespacho: "despacho",
      cliente: "Ferretería Don Pepe",
      contacto: "Marcelo Soto",
      vendedor: "Ana Silva",
      documento: "Guía de despacho",
      modoDespacho: "Starken",
      situacionCobro: null,
      direccionEntrega: "Av. Irarrázaval 3400",
      comuna: "Ñuñoa",
      telefonoContacto: "+56 9 2211 0099",
      nuevo: true,
      productos: [{ sku: "CAS-INC-04", nombre: "Casco estructural F4", cantidad: 2, stock: 10, estado: "ok", preparado: 2 }],
    },
    // Tres pedidos más, ya clasificados y completos, directo a "Por
    // preparar" en Bodega — para probar el cierre + impresión de carátula
    // (con logo) en distintos modos: Starken con OC, Robinson (firma) y
    // Cliente retira (foto factura/boleta, sin carátula de bulto).
    {
      id: "PED-10504",
      oc: "OC-2301",
      columnaDespacho: "despacho",
      cliente: "Hospital San Borja",
      contacto: "Daniela Rojas",
      vendedor: "Ana Silva",
      documento: "Factura",
      modoDespacho: "Starken",
      situacionCobro: null,
      direccionEntrega: "Av. Salvador 364",
      comuna: "Providencia",
      telefonoContacto: "+56 9 7711 2244",
      nuevo: true,
      productos: [{ sku: "EXT-PQS-6K", nombre: "Extintor PQS 6kg", cantidad: 3, stock: 10, estado: "ok", preparado: 3 }],
    },
    {
      id: "PED-10505",
      oc: null,
      columnaDespacho: "despacho",
      cliente: "Colegio San Ignacio",
      contacto: "Patricio Lagos",
      vendedor: "Diego Ortiz",
      documento: "Guía de despacho",
      modoDespacho: "Robinson",
      situacionCobro: null,
      direccionEntrega: "Av. Pedro de Valdivia 1670",
      comuna: "Providencia",
      telefonoContacto: "+56 9 8899 0011",
      nuevo: true,
      productos: [{ sku: "SEN-HUM-01", nombre: "Sensor de humo interconectado", cantidad: 4, stock: 15, estado: "ok", preparado: 4 }],
    },
    {
      id: "PED-10506",
      oc: null,
      columnaDespacho: "despacho",
      cliente: "Panadería Los Hornos",
      contacto: "Rosa Muñoz",
      vendedor: "Ana Silva",
      documento: "Boleta",
      modoDespacho: "Cliente retira",
      situacionCobro: null,
      nuevo: true,
      productos: [{ sku: "EXT-CO2-5K", nombre: "Extintor CO2 5kg", cantidad: 1, stock: 15, estado: "ok", preparado: 1 }],
    },
    {
      id: "PED-10507",
      oc: "OC-2312",
      columnaDespacho: "despacho",
      cliente: "Clínica Las Condes Sur",
      contacto: "Francisca Lagos",
      vendedor: "Diego Ortiz",
      documento: "Guía de despacho",
      modoDespacho: "Starken",
      situacionCobro: null,
      direccionEntrega: "Av. Apoquindo 4501",
      comuna: "Las Condes",
      telefonoContacto: "+56 9 4455 6677",
      nuevo: true,
      productos: [{ sku: "EXT-PQS-6K", nombre: "Extintor PQS 6kg", cantidad: 4, stock: 10, estado: "ok", preparado: 4 }],
    },
  ];

  for (const p of pedidos) {
    const { productos, ...pedido } = p;
    await prisma.pedido.create({
      data: {
        ...pedido,
        productos: { create: productos },
      },
    });
  }

  const ordenes = [
    { id: "OC-2291b", columna: "por_pedir", proveedor: "Firetech USA", producto: "Bolso de trauma con insumos", cantidad: 3, monto: 780000, origenPedido: "PED-10428", creadoEn: new Date(Date.now() - 8 * 86400000) },
    { id: "OC-2296", columna: "por_pedir", proveedor: "Firetech USA", producto: "Kit de insumos", cantidad: 10, monto: 420000, origenPedido: "PED-10460", creadoEn: new Date(Date.now() - 2 * 86400000) },
    { id: "OC-2297", columna: "por_pedir", proveedor: "SafetyPro Chile", producto: "Guante Vision talla M", cantidad: 24, monto: 560000, origenPedido: "PED-10432 (8) + reposición (16)", creadoEn: new Date(Date.now() - 1 * 86400000) },
    { id: "OC-2291", columna: "oc_construccion", proveedor: "Firetech USA", producto: "Bolso de trauma con insumos", cantidad: 3, monto: 780000, condicionPago: "Crédito 30 días" },
    { id: "OC-2277", columna: "oc_pendientes", proveedor: "SafetyPro Chile", producto: "Extintor PQS 6kg", cantidad: 40, monto: 5200000, modalidadPago: "Pago contra despacho", filaPago: "pendientes_despacho" },
    { id: "OC-2260", columna: "oc_pendientes", proveedor: "DELPA Miami", producto: "Guante Vision (varias tallas)", cantidad: 120, monto: 3100000, modalidadPago: "Pago contra OC", filaPago: "pendientes_pago" },
    { id: "OC-2248", columna: "transito_miami", proveedor: "Rescue Gear Inc.", producto: "Traje EPP nivel B", cantidad: 15, monto: 4300000, tracking: "1Z999AA10123456784", transportistaNombre: "UPS" },
    { id: "OC-2231", columna: "arribado_miami", proveedor: "Rescue Gear Inc.", producto: "Botas industriales 42", cantidad: 30, monto: 1650000, warehouseReceipt: "WR-DELPA-4471" },
    { id: "OC-2219", columna: "transito_chile", proveedor: "Consolidado CONS-DELPA-118", producto: "Sensor de humo interconectado", cantidad: 60, monto: 2100000, awb: "AWB-778-5521" },
    { id: "OC-2195", columna: "arribado_chile", proveedor: "SafetyPro Chile", producto: "Extintor CO2 5kg", cantidad: 25, monto: 1900000, modalidadPago: "Crédito", filaPago: "pendientes_despacho" },
    { id: "OC-2180", columna: "cargas_recibidas", proveedor: "SafetyPro Chile", producto: "Casco estructural F4", cantidad: 50, monto: 3400000, modalidadPago: "Crédito", filaPago: "pendientes_despacho" },
  ];
  for (const o of ordenes) {
    await prisma.ordenCompra.create({ data: o });
  }

  const proveedores = [
    { nombre: "SafetyPro Chile", condicionPago: "Crédito 30 días", ruta: "Directo internacional" },
    { nombre: "Firetech USA", condicionPago: "Crédito 30 días", ruta: "Nacional" },
    { nombre: "DELPA Miami", condicionPago: "Pago contra OC", ruta: "Consolidado Miami" },
    { nombre: "Rescue Gear Inc.", condicionPago: "Pago contra despacho", ruta: "Consolidado Miami" },
  ];
  const cuentasPorPagar = [
    {
      ordenCompraId: "OC-2180", proveedor: "SafetyPro Chile", modalidad: "Crédito",
      facturaNumero: "F-SPC-9911", facturaFechaEmision: new Date(Date.now() - 25 * 86400000),
      monto: 3400000, fechaVencimiento: new Date(Date.now() + 5 * 86400000),
    },
    {
      ordenCompraId: "OC-2195", proveedor: "SafetyPro Chile", modalidad: "Crédito",
      facturaNumero: "F-SPC-9820", facturaFechaEmision: new Date(Date.now() - 40 * 86400000),
      monto: 1900000, fechaVencimiento: new Date(Date.now() - 10 * 86400000),
    },
    {
      ordenCompraId: "OC-2260", proveedor: "DELPA Miami", modalidad: "Anticipo",
      facturaNumero: "INV-DELPA-551", facturaFechaEmision: new Date(Date.now() - 3 * 86400000),
      monto: 3100000, fechaVencimiento: null,
    },
    {
      ordenCompraId: "OC-2277", proveedor: "SafetyPro Chile", modalidad: "Contra entrega",
      facturaNumero: "F-SPC-9870", facturaFechaEmision: new Date(Date.now() - 1 * 86400000),
      monto: 5200000, montoPagado: 2000000, estado: "parcial", fechaVencimiento: null,
    },
  ];
  for (const c of cuentasPorPagar) {
    await prisma.cuentaPorPagar.create({ data: c });
  }

  for (const p of proveedores) {
    await prisma.proveedor.create({ data: p });
  }

  const productosMaestro = [
    { sku: "GUA-VIS-M", nombre: "Guante Vision talla M", proveedor: "SafetyPro Chile", stockActual: 2, minimo: 40, maximo: 80 },
    { sku: "CASCO-F4", nombre: "Casco estructural F4", proveedor: "SafetyPro Chile", stockActual: 5, minimo: 10, maximo: 30 },
    { sku: "EXT-CO2-5", nombre: "Extintor CO2 5kg", proveedor: "SafetyPro Chile", stockActual: 18, minimo: 10, maximo: 40 },
    { sku: "TRAJE-EPPB", nombre: "Traje EPP nivel B", proveedor: "Rescue Gear Inc.", stockActual: 3 },
  ];
  for (const pm of productosMaestro) {
    await prisma.productoMaestro.create({ data: pm });
  }

  const vendedoresMaestro = [
    { nombre: "Ana Silva" },
    { nombre: "Diego Ortiz" },
  ];
  for (const v of vendedoresMaestro) {
    await prisma.vendedor.create({ data: v });
  }

  const transportistas = [
    { nombre: "UPS", tipo: "Courier internacional", urlRastreo: "https://www.ups.com/track?tracknum={tracking}" },
    { nombre: "DHL", tipo: "Courier internacional", urlRastreo: "https://www.dhl.com/cl-es/home/tracking.html?tracking-id={tracking}" },
    { nombre: "DELPA Miami", tipo: "Consolidador Miami", urlRastreo: null },
    { nombre: "Starken", tipo: "Nacional", urlRastreo: "https://www.starken.cl/seguimiento?codigo={tracking}" },
    { nombre: "Chilexpress", tipo: "Nacional", urlRastreo: "https://www.chilexpress.cl/seguimiento/{tracking}" },
  ];
  for (const t of transportistas) {
    await prisma.transportista.create({ data: t });
  }

  const usuarios = [
    { nombre: "Luisana", rol: "despacho" },
    { nombre: "María José", rol: "cobranzas" },
    { nombre: "Fernando", rol: "bodega" },
    { nombre: "Marcela", rol: "compras" },
    { nombre: "Ana Silva", rol: "vendedor" },
    { nombre: "Alex", rol: "admin" },
  ];
  for (const u of usuarios) {
    await prisma.usuario.create({ data: u });
  }

  console.log("Seed listo:", pedidos.length, "pedidos,", ordenes.length, "OC,", usuarios.length, "usuarios.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
