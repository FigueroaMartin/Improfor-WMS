"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { COLUMNAS_POR_RUTA, RUTAS_PROVEEDOR, COLUMNAS_COMPRAS } from "@/lib/dominio";

// --- Seguimiento / bitácora de la OC (mockup Compras_OC_Detalle_Seguimiento) —
// reutiliza la misma tabla de historial que Bodega/Despacho/Cobranzas
// (area: "compras"), con pedidoId = ID de la OC.

async function registrarHistorialOC(ocId: string, accion: string) {
  await prisma.historialAccion.create({ data: { area: "compras", pedidoId: ocId, accion, snapshot: "{}" } });
}

export async function obtenerHistorialOC(ocId: string) {
  return prisma.historialAccion.findMany({ where: { area: "compras", pedidoId: ocId }, orderBy: { creadoEn: "desc" } });
}

// Comentario libre de la bitácora — Pablo/Marcela dejan nota de seguimiento
// (ej. "proveedor confirma despacho el viernes").
export async function agregarComentarioOC(ocId: string, texto: string) {
  if (!texto.trim()) return { ok: false, error: "Escribe un comentario." };
  await registrarHistorialOC(ocId, `💬 ${texto.trim()}`);
  revalidatePath("/compras");
  return { ok: true };
}

export async function moverOrden(id: string, columnaDestino: string) {
  const oc = await prisma.ordenCompra.findUnique({ where: { id } });
  if (!oc) return { ok: false, error: "OC no encontrada" };
  if (oc.cargaId) return { ok: false, error: `Esta OC pertenece al embarque ${oc.cargaId} — se mueve junto con el resto del embarque.` };

  const proveedor = await prisma.proveedor.findUnique({ where: { nombre: oc.proveedor } });
  if (proveedor) {
    const permitidas = COLUMNAS_POR_RUTA[proveedor.ruta as keyof typeof COLUMNAS_POR_RUTA];
    if (permitidas && !permitidas.includes(columnaDestino)) {
      const nombreCol = COLUMNAS_COMPRAS.find((c) => c.id === columnaDestino)?.nombre ?? columnaDestino;
      return { ok: false, error: `«${proveedor.nombre}» tiene ruta «${proveedor.ruta}» — no pasa por «${nombreCol}».` };
    }
  }

  await prisma.ordenCompra.update({ where: { id }, data: { columna: columnaDestino } });
  const nombreDestino = COLUMNAS_COMPRAS.find((c) => c.id === columnaDestino)?.nombre ?? columnaDestino;
  await registrarHistorialOC(id, `Movido a «${nombreDestino}»`);
  revalidatePath("/compras");
  return { ok: true };
}

// --- Maestro de proveedores (§5 pendiente #10 — reglas de ruta) ----------

export async function obtenerProveedores() {
  return prisma.proveedor.findMany({ orderBy: { nombre: "asc" } });
}

export async function guardarProveedor(
  nombre: string,
  datos: { condicionPago?: string | null; ruta: string }
) {
  if (!nombre.trim()) return { ok: false, error: "Falta el nombre." };
  if (!RUTAS_PROVEEDOR.includes(datos.ruta as any)) return { ok: false, error: "Ruta inválida." };

  await prisma.proveedor.upsert({
    where: { nombre },
    create: { nombre, condicionPago: datos.condicionPago || null, ruta: datos.ruta },
    update: { condicionPago: datos.condicionPago || null, ruta: datos.ruta },
  });
  revalidatePath("/compras");
  return { ok: true };
}

// Genera el plan de pago por tramos según la modalidad del proveedor
// (§3 Compras — Compras_OC_Gestionar_Pago). Crédito no necesita tramos
// (no cae en la fila roja de "Pendientes de pago").
async function crearTramosSegunModalidad(id: string, monto: number, modalidadPago: string) {
  if (modalidadPago === "Pago contra despacho") {
    await prisma.pagoTramo.create({
      data: { ordenCompraId: id, etiqueta: "100% contra despacho", monto },
    });
  } else if (modalidadPago === "Pago contra OC") {
    const primero = Math.round(monto / 2);
    await prisma.pagoTramo.createMany({
      data: [
        { ordenCompraId: id, etiqueta: "50% al emitir la OC", monto: primero },
        { ordenCompraId: id, etiqueta: "50% contra entrega", monto: monto - primero },
      ],
    });
  }
  // "Crédito" no genera tramos — se paga a su vencimiento (Gerencia Finanzas).
}

export async function obtenerTramosPago(ordenCompraId: string) {
  const existentes = await prisma.pagoTramo.findMany({ where: { ordenCompraId }, orderBy: { id: "asc" } });
  if (existentes.length > 0) return existentes;

  // Compatibilidad — OCs que ya estaban en "Pendientes de pago" antes de
  // que existiera el plan de tramos (o creadas directo en la fila roja):
  // se generan al abrir por primera vez.
  const oc = await prisma.ordenCompra.findUnique({ where: { id: ordenCompraId } });
  if (!oc || oc.filaPago !== "pendientes_pago" || !oc.modalidadPago) return [];
  await crearTramosSegunModalidad(ordenCompraId, oc.monto, oc.modalidadPago);
  return prisma.pagoTramo.findMany({ where: { ordenCompraId }, orderBy: { id: "asc" } });
}

// Pop-up "Registrar pago" de un tramo — monto/fecha ya vienen del tramo,
// falta medio + N° comprobante. Al pagar el ÚLTIMO tramo, la OC pasa sola
// a "Pendientes de despacho" (verde).
export async function registrarPagoTramo(tramoId: number, datos: { medio: string; comprobante?: string }) {
  const tramo = await prisma.pagoTramo.findUnique({ where: { id: tramoId } });
  if (!tramo) return { ok: false, error: "Tramo no encontrado" };
  if (tramo.pagado) return { ok: false, error: "Este tramo ya está pagado." };
  if (!datos.medio.trim()) return { ok: false, error: "Elige el medio de pago." };

  await prisma.pagoTramo.update({
    where: { id: tramoId },
    data: { pagado: true, fecha: new Date(), medio: datos.medio, comprobante: datos.comprobante || null },
  });

  await registrarHistorialOC(tramo.ordenCompraId, `Pago registrado — ${tramo.etiqueta} (${datos.medio}${datos.comprobante ? `, comprobante ${datos.comprobante}` : ""})`);

  const pendientes = await prisma.pagoTramo.count({ where: { ordenCompraId: tramo.ordenCompraId, pagado: false } });
  if (pendientes === 0) {
    await prisma.ordenCompra.update({ where: { id: tramo.ordenCompraId }, data: { filaPago: "pendientes_despacho" } });
    await registrarHistorialOC(tramo.ordenCompraId, "Saldo pagado — pasó a «Pendiente de despacho»");
  }
  revalidatePath("/compras");
  return { ok: true, saldada: pendientes === 0 };
}

export async function generarOC(id: string) {
  await prisma.ordenCompra.update({ where: { id }, data: { columna: "oc_construccion" } });
  revalidatePath("/compras");
}

// "Por pedir" agrupa por proveedor (§3 Compras) — al emitir, TODAS las
// líneas de ese proveedor que siguen en "Por pedir" pasan juntas a
// "OC (Pablo arma)" (si el proveedor ya tenía una OC en construcción, se
// suma a esa en vez de crear otra).
export async function emitirOCGrupo(proveedor: string) {
  const lineasPorPedir = await prisma.ordenCompra.findMany({ where: { columna: "por_pedir", proveedor } });
  if (lineasPorPedir.length === 0) return { ok: false, error: "No hay líneas de este proveedor en «Por pedir»." };

  const abierta = await prisma.ordenCompra.findFirst({ where: { columna: "oc_construccion", proveedor } });
  await prisma.ordenCompra.updateMany({
    where: { columna: "por_pedir", proveedor },
    data: { columna: "oc_construccion" },
  });
  // Si el grupo estaba "⏸ En espera", emitir la OC resuelve el motivo.
  await prisma.posponerCompra.deleteMany({ where: { proveedor } });
  revalidatePath("/compras");
  return { ok: true, sumadoAExistente: !!abierta };
}

// --- Posponer compra (§7 "NUEVO — Compras_Posponer_OC") -------------------
// Pablo deja registrado, desde el grupo del proveedor en "Por pedir", que
// todavía no emite la OC — no bloquea nada, las líneas se siguen
// acumulando; el grupo solo queda marcado "⏸ En espera · motivo".

export async function obtenerPosposicionesCompra() {
  return prisma.posponerCompra.findMany();
}

export async function posponerCompraProveedor(
  proveedor: string,
  datos: { motivo: string; fechaReevaluar?: string | null; nota?: string | null }
) {
  if (!datos.motivo) return { ok: false, error: "Elige un motivo." };

  await prisma.posponerCompra.upsert({
    where: { proveedor },
    create: {
      proveedor, motivo: datos.motivo, nota: datos.nota || null,
      fechaReevaluar: datos.fechaReevaluar ? new Date(datos.fechaReevaluar) : null,
    },
    update: {
      motivo: datos.motivo, nota: datos.nota || null,
      fechaReevaluar: datos.fechaReevaluar ? new Date(datos.fechaReevaluar) : null,
    },
  });
  revalidatePath("/compras");
  return { ok: true };
}

export async function quitarPosposicionCompra(proveedor: string) {
  await prisma.posponerCompra.deleteMany({ where: { proveedor } });
  revalidatePath("/compras");
  return { ok: true };
}

// OC en construcción — Marcela completa condición de pago / costo unitario
// / nota antes de emitir. "Guardar borrador" no cambia de columna.
export async function guardarBorradorOC(
  id: string,
  datos: { condicionPago?: string | null; costoUnitario?: number | null; nota?: string | null }
) {
  const oc = await prisma.ordenCompra.findUnique({ where: { id } });
  if (!oc) return { ok: false, error: "OC no encontrada" };

  // Si se cargó el costo unitario (viene de Laudus), recalcula el monto
  // total de la línea — las líneas auto-generadas desde Despacho nacen en
  // $0 porque todavía no se sabe el costo.
  const monto = datos.costoUnitario != null ? datos.costoUnitario * oc.cantidad : undefined;

  await prisma.ordenCompra.update({ where: { id }, data: { ...datos, ...(monto != null ? { monto } : {}) } });
  revalidatePath("/compras");
  return { ok: true };
}

// Emitir la OC definitiva: pasa a "OC Pendientes" — la fila (despacho /
// sin recepción conforme / pendiente de pago) depende de la modalidad de
// pago del proveedor.
// --- Maestro de transportistas (§3 Compras — Compras_Transportistas) -----
// Se guardan una vez en la base del software (no en Laudus) y alimentan el
// desplegable de "Registrar envío", con URL de rastreo con patrón
// "{tracking}" para el botón "Rastrear en el sitio de...".

export async function obtenerTransportistas(soloActivos = false) {
  return prisma.transportista.findMany({
    where: soloActivos ? { activo: true } : undefined,
    orderBy: { nombre: "asc" },
  });
}

export async function guardarTransportista(
  nombre: string,
  datos: { tipo: string; urlRastreo?: string | null }
) {
  if (!nombre.trim()) return { ok: false, error: "Falta el nombre." };
  if (!datos.tipo) return { ok: false, error: "Falta el tipo de transportista." };

  await prisma.transportista.upsert({
    where: { nombre },
    create: { nombre, tipo: datos.tipo, urlRastreo: datos.urlRastreo || null },
    update: { tipo: datos.tipo, urlRastreo: datos.urlRastreo || null },
  });
  revalidatePath("/compras");
  return { ok: true };
}

export async function cambiarActivoTransportista(nombre: string, activo: boolean) {
  await prisma.transportista.update({ where: { nombre }, data: { activo } });
  revalidatePath("/compras");
}

// "Registrar envío" — asigna transportista + N° de seguimiento a la OC.
export async function registrarEnvio(id: string, transportistaNombre: string, tracking: string) {
  if (!transportistaNombre) return { ok: false, error: "Elige un transportista." };
  if (!tracking.trim()) return { ok: false, error: "Falta el N° de seguimiento." };

  await prisma.ordenCompra.update({
    where: { id },
    data: { transportistaNombre, tracking: tracking.trim() },
  });
  await registrarHistorialOC(id, `Envío registrado — ${transportistaNombre} · ${tracking.trim()}`);
  revalidatePath("/compras");
  return { ok: true };
}

// --- Factura del proveedor → Gerencia Finanzas (§7 "EN CURSO — Perfil
// «Gerencia Finanzas»") ----------------------------------------------------
// Al registrar el envío, Marcela también carga la factura del proveedor
// (N° + fecha de emisión + monto — puede diferir de la OC por flete o
// descuento). Eso genera la cuenta por pagar que ve Finanzas.

const MODALIDAD_FINANZAS: Record<string, string> = {
  "Crédito": "Crédito",
  "Pago contra OC": "Anticipo",
  "Pago contra despacho": "Contra entrega",
};

// "Crédito 30 días", "Crédito a 60 días" → 30 / 60. Sin número reconocible,
// 30 días por defecto (🧪 simplificación — en Laudus esto sería un dato
// estructurado del maestro de proveedores, no texto libre).
function diasDeCondicionPago(condicionPago: string | null | undefined): number {
  const match = condicionPago?.match(/\d+/);
  return match ? Number(match[0]) : 30;
}

export async function obtenerCuentaPorPagar(ordenCompraId: string) {
  return prisma.cuentaPorPagar.findUnique({ where: { ordenCompraId } });
}

export async function registrarFacturaProveedor(
  ordenCompraId: string,
  datos: { numero: string; fechaEmision: string; monto: number }
) {
  if (!datos.numero.trim()) return { ok: false, error: "Falta el N° de factura." };
  if (!datos.fechaEmision) return { ok: false, error: "Falta la fecha de emisión." };
  if (!datos.monto || datos.monto <= 0) return { ok: false, error: "El monto de la factura debe ser mayor a 0." };

  const oc = await prisma.ordenCompra.findUnique({ where: { id: ordenCompraId } });
  if (!oc) return { ok: false, error: "OC no encontrada" };
  if (!oc.modalidadPago) return { ok: false, error: "Esta OC todavía no tiene modalidad de pago (emítela primero)." };

  const modalidad = MODALIDAD_FINANZAS[oc.modalidadPago] ?? "Crédito";
  const fechaEmision = new Date(datos.fechaEmision);

  let fechaVencimiento: Date | null = null;
  if (modalidad === "Crédito") {
    const proveedor = await prisma.proveedor.findUnique({ where: { nombre: oc.proveedor } });
    const dias = diasDeCondicionPago(proveedor?.condicionPago);
    fechaVencimiento = new Date(fechaEmision.getTime() + dias * 86400000);
  }

  // Si Marcela edita el monto de una factura que Finanzas ya empezó a
  // pagar, no puede quedar por debajo de lo ya pagado — dejaría un saldo
  // negativo sin que el estado se entere.
  const existente = await prisma.cuentaPorPagar.findUnique({ where: { ordenCompraId } });
  if (existente && datos.monto < existente.montoPagado) {
    return {
      ok: false,
      error: `El monto no puede ser menor a lo ya pagado ($${existente.montoPagado.toLocaleString("es-CL")}).`,
    };
  }
  const estado = existente
    ? datos.monto === existente.montoPagado
      ? "pagada"
      : existente.montoPagado > 0
        ? "parcial"
        : "pendiente"
    : "pendiente";

  await prisma.cuentaPorPagar.upsert({
    where: { ordenCompraId },
    create: {
      ordenCompraId, proveedor: oc.proveedor, modalidad,
      facturaNumero: datos.numero.trim(), facturaFechaEmision: fechaEmision, monto: datos.monto, fechaVencimiento,
    },
    update: {
      facturaNumero: datos.numero.trim(), facturaFechaEmision: fechaEmision, monto: datos.monto, fechaVencimiento, estado,
    },
  });
  await registrarHistorialOC(
    ordenCompraId,
    `Factura del proveedor registrada — N° ${datos.numero.trim()}, ${modalidad}${fechaVencimiento ? `, vence ${fechaVencimiento.toLocaleDateString("es-CL")}` : ""} — enviada a Gerencia Finanzas`
  );
  revalidatePath("/compras");
  revalidatePath("/finanzas");
  return { ok: true };
}

// --- Consolidado de Miami (§5 pendiente #7) -------------------------------
// "Carga (embarque) = unidad de seguimiento, agrupa varias OC". Se arma con
// OC ya en «Pendiente de despacho» (ruta Consolidado Miami) y desde ahí
// avanza como un solo bloque — todas sus OC se mueven juntas.

const COLUMNAS_EMBARQUE = ["transito_miami", "arribado_miami", "transito_chile", "arribado_chile", "cargas_recibidas"];

// Solo embarcables las OC de proveedores ruta "Consolidado Miami" — las
// mismas reglas de ruta que ya bloquean el drag-and-drop individual
// (moverOrden) deben aplicar acá, si no un proveedor "Nacional" o "Directo
// internacional" podría terminar paseando por Miami igual. Si el
// proveedor no está en el maestro (sin ruta registrada), se deja pasar —
// mismo criterio permisivo que moverOrden.
export async function obtenerOCsParaEmbarcar() {
  const candidatas = await prisma.ordenCompra.findMany({
    where: { columna: "oc_pendientes", filaPago: "pendientes_despacho", cargaId: null },
    orderBy: { proveedor: "asc" },
  });
  const proveedores = await prisma.proveedor.findMany({ where: { nombre: { in: candidatas.map((o) => o.proveedor) } } });
  const rutaPorProveedor = new Map(proveedores.map((p) => [p.nombre, p.ruta]));
  return candidatas.filter((o) => (rutaPorProveedor.get(o.proveedor) ?? "Consolidado Miami") === "Consolidado Miami");
}

export async function obtenerCargas() {
  return prisma.carga.findMany({ include: { ordenes: true }, orderBy: { creadoEn: "desc" } });
}

export async function crearEmbarque(ocIds: string[], datos: { warehouseReceipt?: string | null; awb?: string | null }) {
  if (ocIds.length === 0) return { ok: false, error: "Elige al menos una OC." };

  // Defensa en profundidad — aunque el panel ya filtra por ruta, revalida
  // acá por si la lista quedó desactualizada (otra pestaña, otro usuario).
  const ocs = await prisma.ordenCompra.findMany({ where: { id: { in: ocIds } } });
  const proveedores = await prisma.proveedor.findMany({ where: { nombre: { in: ocs.map((o) => o.proveedor) } } });
  const rutaPorProveedor = new Map(proveedores.map((p) => [p.nombre, p.ruta]));
  const noMiami = ocs.find((o) => (rutaPorProveedor.get(o.proveedor) ?? "Consolidado Miami") !== "Consolidado Miami");
  if (noMiami) return { ok: false, error: `${noMiami.id} es de «${noMiami.proveedor}», que no tiene ruta Consolidado Miami.` };

  const id = `EMB-${Math.floor(1000 + Math.random() * 8999)}`;
  await prisma.carga.create({ data: { id, columna: "transito_miami", ...datos } });
  await prisma.ordenCompra.updateMany({
    where: { id: { in: ocIds } },
    data: { cargaId: id, columna: "transito_miami" },
  });
  for (const ocId of ocIds) {
    await registrarHistorialOC(ocId, `Embarcada en ${id} — «En tránsito a Miami»`);
  }
  revalidatePath("/compras");
  return { ok: true, id };
}

// Avanza el embarque completo a la siguiente columna de la ruta Miami →
// Chile — arrastra con él a todas las OC que agrupa.
export async function avanzarCarga(cargaId: string) {
  const carga = await prisma.carga.findUnique({ where: { id: cargaId } });
  if (!carga) return { ok: false, error: "Embarque no encontrado" };

  const i = COLUMNAS_EMBARQUE.indexOf(carga.columna);
  if (i === -1 || i === COLUMNAS_EMBARQUE.length - 1) return { ok: false, error: "Ya está en la última etapa." };

  const columnaDestino = COLUMNAS_EMBARQUE[i + 1];
  const nombreDestino = COLUMNAS_COMPRAS.find((c) => c.id === columnaDestino)?.nombre ?? columnaDestino;
  await prisma.carga.update({ where: { id: cargaId }, data: { columna: columnaDestino } });
  const ocsDelEmbarque = await prisma.ordenCompra.findMany({ where: { cargaId } });
  await prisma.ordenCompra.updateMany({ where: { cargaId }, data: { columna: columnaDestino } });
  for (const oc of ocsDelEmbarque) {
    await registrarHistorialOC(oc.id, `Embarque ${cargaId} avanzó a «${nombreDestino}»`);
  }
  revalidatePath("/compras");
  return { ok: true };
}

export async function guardarDatosCarga(cargaId: string, datos: { warehouseReceipt?: string | null; awb?: string | null }) {
  await prisma.carga.update({ where: { id: cargaId }, data: datos });
  revalidatePath("/compras");
  return { ok: true };
}

// --- Política de stock / alertas de reposición (§5 pendiente #9 — por    --
// diseñar con Pablo; §6 "con mín/máx = «de stock»; sin = «a pedido»") -----
// stockActual simula el disponible de Laudus; "en tránsito" se cruza con
// las OC abiertas (todo lo que no llegó a «Cargas recibidas» todavía).

export async function obtenerProductosMaestro() {
  return prisma.productoMaestro.findMany({ orderBy: { nombre: "asc" } });
}

export async function guardarProductoMaestro(
  sku: string,
  datos: { nombre: string; proveedor?: string | null; stockActual: number; minimo?: number | null; maximo?: number | null }
) {
  if (!sku.trim()) return { ok: false, error: "Falta el SKU." };
  if (!datos.nombre.trim()) return { ok: false, error: "Falta el nombre." };
  if (datos.minimo != null && datos.maximo != null && datos.maximo < datos.minimo) {
    return { ok: false, error: "El máximo no puede ser menor que el mínimo." };
  }

  await prisma.productoMaestro.upsert({
    where: { sku },
    create: { sku, ...datos },
    update: datos,
  });
  revalidatePath("/compras");
  return { ok: true };
}

// Alertas de reposición — solo productos "de stock" (con mínimo cargado)
// cuyo disponible + en tránsito no alcanza el mínimo. Se vacía solo al
// generar la OC (confirmado Alex) — no hay botón para cerrarlas a mano.
export async function obtenerAlertasReposicion() {
  const productos = await prisma.productoMaestro.findMany({ where: { minimo: { not: null } } });
  const alertas = [];
  for (const p of productos) {
    const enTransito = await prisma.ordenCompra.aggregate({
      where: { producto: p.nombre, columna: { not: "cargas_recibidas" } },
      _sum: { cantidad: true },
    });
    const transito = enTransito._sum.cantidad ?? 0;
    const faltante = p.minimo! - (p.stockActual + transito);
    if (faltante > 0) {
      alertas.push({ ...p, transito, faltante });
    }
  }
  return alertas;
}

// Genera (o suma a) la línea de "Por pedir" que cubre la alerta — repone
// hasta el máximo (o el doble del mínimo si no hay máximo cargado).
export async function generarOCReposicion(sku: string) {
  const p = await prisma.productoMaestro.findUnique({ where: { sku } });
  if (!p || p.minimo == null) return { ok: false, error: "Producto no encontrado o sin política de stock." };

  const enTransito = await prisma.ordenCompra.aggregate({
    where: { producto: p.nombre, columna: { not: "cargas_recibidas" } },
    _sum: { cantidad: true },
  });
  const transito = enTransito._sum.cantidad ?? 0;
  const tope = p.maximo ?? p.minimo * 2;
  const cantidad = tope - (p.stockActual + transito);
  if (cantidad <= 0) return { ok: false, error: "Ya no hay faltante — revisa las alertas de nuevo." };

  const proveedor = p.proveedor ?? "Por asignar";
  const existente = await prisma.ordenCompra.findFirst({ where: { columna: "por_pedir", proveedor, producto: p.nombre } });
  if (existente) {
    const origenActualizado = existente.origenPedido ? `${existente.origenPedido} + reposición (${cantidad})` : `reposición (${cantidad})`;
    await prisma.ordenCompra.update({
      where: { id: existente.id },
      data: { cantidad: existente.cantidad + cantidad, origenPedido: origenActualizado },
    });
  } else {
    const id = `OC-REP-${sku}`;
    const yaExiste = await prisma.ordenCompra.findUnique({ where: { id } });
    if (yaExiste) return { ok: false, error: "Ya existe una OC de reposición para este SKU." };
    await prisma.ordenCompra.create({
      data: { id, columna: "por_pedir", proveedor, producto: p.nombre, cantidad, monto: 0, origenPedido: `reposición (${cantidad})` },
    });
  }
  revalidatePath("/compras");
  return { ok: true };
}

// --- Posponer OC (§5c pendiente — descuadres/posponer OC) -----------------
// El proveedor avisa un atraso; se anota hasta cuándo y por qué, sin mover
// la OC de columna (es solo una marca visible + bitácora).

export async function posponerOC(id: string, fecha: string, motivo: string) {
  if (!fecha) return { ok: false, error: "Elige una fecha." };
  if (!motivo.trim()) return { ok: false, error: "Escribe el motivo del atraso." };

  await prisma.ordenCompra.update({ where: { id }, data: { pospuestaHasta: new Date(fecha), pospuestaMotivo: motivo.trim() } });
  await registrarHistorialOC(id, `⏳ Pospuesta hasta ${new Date(fecha).toLocaleDateString("es-CL")} — ${motivo.trim()}`);
  revalidatePath("/compras");
  return { ok: true };
}

export async function quitarPosposicionOC(id: string) {
  await prisma.ordenCompra.update({ where: { id }, data: { pospuestaHasta: null, pospuestaMotivo: null } });
  await registrarHistorialOC(id, "Posposición levantada");
  revalidatePath("/compras");
  return { ok: true };
}

// --- Descuadres de recepción (`Pablo_Descuadres_Recepcion`) ---------------
// Recepción parcial parte la OC en 3 destinos: recibido → Cargas recibidas
// · sobrante → stock/Pablo (＋ azul) · no recibido → OC Pendientes (− rojo).

export async function recepcionarOC(id: string, cantidadRecibida: number) {
  const oc = await prisma.ordenCompra.findUnique({ where: { id } });
  if (!oc) return { ok: false, error: "OC no encontrada" };
  if (cantidadRecibida < 0) return { ok: false, error: "La cantidad no puede ser negativa." };

  const diferencia = cantidadRecibida - oc.cantidad;

  if (diferencia === 0) {
    await prisma.ordenCompra.update({ where: { id }, data: { columna: "cargas_recibidas" } });
    await registrarHistorialOC(id, `Recepcionada completa (${cantidadRecibida}) — pasó a «Cargas recibidas»`);
    revalidatePath("/compras");
    return { ok: true, descuadre: false };
  }

  if (diferencia > 0) {
    // Sobró — toda la OC se da por recibida; el excedente queda registrado
    // como descuadre azul (se ingresa a stock al cerrarlo).
    await prisma.ordenCompra.update({ where: { id }, data: { columna: "cargas_recibidas" } });
    await prisma.descuadre.create({
      data: {
        ordenCompraId: id, proveedor: oc.proveedor, producto: oc.producto, tipo: "sobro",
        cantidadEsperada: oc.cantidad, cantidadRecibida, diferencia, origenPedido: oc.origenPedido,
      },
    });
    await registrarHistorialOC(id, `Recepcionada con sobrante — esperado ${oc.cantidad}, llegaron ${cantidadRecibida} (+${diferencia})`);
    revalidatePath("/compras");
    return { ok: true, descuadre: true };
  }

  // Faltó (o no llegó nada) — lo recibido pasa a Cargas recibidas (si hubo
  // algo) y el resto vuelve a «OC Pendientes» como una nueva línea.
  const tipo = cantidadRecibida === 0 ? "no_llego" : "falto";
  if (cantidadRecibida > 0) {
    await prisma.ordenCompra.update({ where: { id }, data: { cantidad: cantidadRecibida, columna: "cargas_recibidas" } });
  }
  const faltanteId = `${id}-FALT`;
  const yaExiste = await prisma.ordenCompra.findUnique({ where: { id: faltanteId } });
  if (!yaExiste) {
    await prisma.ordenCompra.create({
      data: {
        id: faltanteId, columna: "oc_pendientes", proveedor: oc.proveedor, producto: oc.producto,
        cantidad: -diferencia, monto: 0, origenPedido: `Faltante de ${id}`,
      },
    });
  }
  await prisma.descuadre.create({
    data: {
      ordenCompraId: id, proveedor: oc.proveedor, producto: oc.producto, tipo,
      cantidadEsperada: oc.cantidad, cantidadRecibida, diferencia, origenPedido: oc.origenPedido,
    },
  });
  await registrarHistorialOC(id, cantidadRecibida === 0
    ? `No llegó nada — esperado ${oc.cantidad} — vuelve a «OC Pendientes» (${faltanteId})`
    : `Recepcionada parcial — esperado ${oc.cantidad}, llegaron ${cantidadRecibida} — faltante a «OC Pendientes» (${faltanteId})`);
  revalidatePath("/compras");
  return { ok: true, descuadre: true };
}

export async function obtenerDescuadres() {
  return prisma.descuadre.findMany({ where: { cerrado: false }, orderBy: { creadoEn: "desc" } });
}

// Los "tres cierres": sobrante → ingresa a stock (si el producto está en el
// maestro); faltante/no llegado → generar OC de reposición o descartar la
// diferencia (ej. el proveedor nunca va a despachar el resto).
export async function cerrarDescuadre(id: number, accion: "ingresar_stock" | "generar_oc" | "descartar") {
  const d = await prisma.descuadre.findUnique({ where: { id } });
  if (!d) return { ok: false, error: "Descuadre no encontrado" };

  if (accion === "ingresar_stock") {
    const producto = await prisma.productoMaestro.findFirst({ where: { nombre: d.producto } });
    if (producto) {
      await prisma.productoMaestro.update({ where: { sku: producto.sku }, data: { stockActual: producto.stockActual + d.diferencia } });
    }
  } else if (accion === "generar_oc") {
    const existente = await prisma.ordenCompra.findFirst({ where: { columna: "por_pedir", proveedor: d.proveedor, producto: d.producto } });
    const cantidad = Math.abs(d.diferencia);
    if (existente) {
      await prisma.ordenCompra.update({
        where: { id: existente.id },
        data: { cantidad: existente.cantidad + cantidad, origenPedido: `${existente.origenPedido ?? ""} + descuadre ${d.ordenCompraId} (${cantidad})` },
      });
    } else {
      const nuevoId = `OC-DESC-${d.ordenCompraId}`;
      const yaExiste = await prisma.ordenCompra.findUnique({ where: { id: nuevoId } });
      if (!yaExiste) {
        await prisma.ordenCompra.create({
          data: { id: nuevoId, columna: "por_pedir", proveedor: d.proveedor, producto: d.producto, cantidad, monto: 0, origenPedido: `descuadre ${d.ordenCompraId} (${cantidad})` },
        });
      }
    }
  }

  await prisma.descuadre.update({ where: { id }, data: { cerrado: true } });
  await registrarHistorialOC(d.ordenCompraId, `Descuadre cerrado (${d.tipo}) — ${accion.replace("_", " ")}`);
  revalidatePath("/compras");
  return { ok: true };
}

export async function confirmarEmisionOC(id: string, modalidadPago: string) {
  const oc = await prisma.ordenCompra.findUnique({ where: { id } });
  if (!oc) return { ok: false, error: "OC no encontrada" };
  if (!oc.condicionPago) return { ok: false, error: "Falta la condición de pago." };

  const filaPago = modalidadPago === "Crédito" ? "pendientes_despacho" : "pendientes_pago";
  await prisma.ordenCompra.update({
    where: { id },
    data: { columna: "oc_pendientes", modalidadPago, filaPago },
  });
  await crearTramosSegunModalidad(id, oc.monto, modalidadPago);
  await registrarHistorialOC(id, `OC emitida — ${modalidadPago} — pasó a «OC Pendientes»`);
  revalidatePath("/compras");
  return { ok: true };
}
