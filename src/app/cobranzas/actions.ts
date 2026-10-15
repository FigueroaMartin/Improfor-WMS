"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { avisarBodega } from "@/lib/avisos";
import { generarOrdenesDesdePedido } from "@/lib/comprasCascada";

function revalidarTodo() {
  revalidatePath("/despacho");
  revalidatePath("/bodega");
  revalidatePath("/cobranzas");
  revalidatePath("/vendedores");
  revalidatePath("/compras");
}

async function registrarHistorial(pedidoId: string, accion: string) {
  await prisma.historialAccion.create({ data: { area: "cobranzas", pedidoId, accion, snapshot: "{}" } });
}

// Si el pedido venía del abono en 2 pasos (§5f.5), esos campos quedaban
// seteados para siempre aunque después se facturara y pagara por el flujo
// normal — la tarjeta nunca salía de "② Abono revisado" en Cobranzas y el
// pedido perdía el botón clásico de "Registrar abono". Se limpian acá, al
// quedar saldada la factura real.
function limpiezaAbonoSiLiberado(pedido: { abonoMonto: number | null }, liberado: boolean) {
  if (!liberado || pedido.abonoMonto == null) return {};
  return { abonoMonto: null, abonoFecha: null, abonoNota: null, abonoRevisado: false };
}

export async function registrarAbono(pedidoId: string, monto: number) {
  const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId } });
  if (!pedido || pedido.facturaTotal == null) return;

  const pagado = (pedido.facturaPagado ?? 0) + monto;
  const liberado = pagado >= pedido.facturaTotal;

  await prisma.pedido.update({
    where: { id: pedidoId },
    data: {
      facturaPagado: pagado,
      situacionCobro: liberado ? null : pedido.situacionCobro,
      ...limpiezaAbonoSiLiberado(pedido, liberado),
    },
  });
  await registrarHistorial(pedidoId, `Abono registrado: $${monto.toLocaleString("es-CL")}${liberado ? " — factura saldada" : ""}`);

  if (liberado && ["salida_bodega", "despacho"].includes(pedido.columnaDespacho)) {
    await avisarBodega(`Pedido liberado — ya puedes preparar: ${pedidoId}`, pedidoId);
  }

  revalidarTodo();
}

// Simula lo que en producción llegaría solo, vía API, cuando Laudus marca la factura pagada.
export async function simularPagoERP(pedidoId: string) {
  const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId } });
  if (!pedido || pedido.facturaTotal == null) return;

  await prisma.pedido.update({
    where: { id: pedidoId },
    data: { facturaPagado: pedido.facturaTotal, situacionCobro: null, ...limpiezaAbonoSiLiberado(pedido, true) },
  });
  await registrarHistorial(pedidoId, "Pago detectado desde Laudus (simulado) — factura saldada");

  if (["salida_bodega", "despacho"].includes(pedido.columnaDespacho)) {
    await avisarBodega(`Pedido liberado — ya puedes preparar: ${pedidoId}`, pedidoId);
  }

  revalidarTodo();
}

export async function subirGuia(pedidoId: string) {
  await prisma.pedido.update({ where: { id: pedidoId }, data: { guiaRecepcionada: true } });
  await registrarHistorial(pedidoId, "Guía recepcionada subida (Robinson)");
  revalidarTodo();
}

// Botón "Recordar pago" (§5f.3) — correo al cliente avisando que el
// producto está listo pero pendiente de pago. Mensaje editable, se puede
// reenviar; cada envío queda en el historial.
export async function recordarPago(pedidoId: string, mensaje: string) {
  const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId } });
  if (!pedido) return { ok: false, error: "Pedido no encontrado" };
  if (!mensaje.trim()) return { ok: false, error: "Escribe un mensaje." };

  await registrarHistorial(pedidoId, `✉ Recordatorio de pago enviado a ${pedido.cliente}: "${mensaje.trim().slice(0, 120)}"`);
  revalidarTodo();
  return { ok: true };
}

// Paso 2 del abono en 2 pasos (§5f.5) — María José revisó la cartola y
// los fondos SÍ están en la cuenta ("Depósito visto en cartola"). Recién
// acá se libera el pedido a "Por pedir" de Compras.
export async function confirmarAbonoRevisado(pedidoId: string) {
  const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId } });
  if (!pedido || pedido.abonoMonto == null) return { ok: false, error: "Este pedido no tiene un abono pendiente de revisar." };
  if (pedido.abonoRevisado) return { ok: false, error: "Este abono ya fue revisado." };

  // Antes de mover el pedido — si esto falla, el pedido se queda donde
  // estaba en vez de quedar marcado "Por pedir" sin su línea en Compras.
  await generarOrdenesDesdePedido(pedidoId);
  await prisma.pedido.update({
    where: { id: pedidoId },
    data: { abonoRevisado: true, columnaDespacho: "por_pedir" },
  });
  await prisma.historialAccion.create({
    data: {
      area: "cobranzas",
      pedidoId,
      accion: `Depósito visto en cartola — $${pedido.abonoMonto.toLocaleString("es-CL")} — liberado a «Por pedir» (Compras)`,
      snapshot: "{}",
    },
  });
  revalidarTodo();
  return { ok: true };
}

export async function obtenerHistorialCobranza(pedidoId: string) {
  return prisma.historialAccion.findMany({
    where: { area: "cobranzas", pedidoId },
    orderBy: { creadoEn: "desc" },
  });
}

// --- Factura anticipada — 3 filas (§5f.7 / §5f.8) -------------------------

// --- Ficha de cliente v2 (§5f.6) ------------------------------------------
// La identidad (razón social, dirección de facturación) es de Laudus 🔒;
// acá se administra solo lo propio del software: días de facturación,
// modalidad (parcializada/total) y los contactos de cobranza.

export async function obtenerFichaCliente(nombre: string) {
  return prisma.cliente.findUnique({ where: { nombre } });
}

export async function guardarFichaCliente(
  nombre: string,
  datos: { diasFacturacion?: number | null; modalidadFacturacion?: string | null; contactoComprador?: string | null; contactoPagos?: string | null }
) {
  await prisma.cliente.upsert({
    where: { nombre },
    create: { nombre, ...datos },
    update: datos,
  });
  revalidarTodo();
  return { ok: true };
}

// Fila 1 → 2: se genera la factura desde el software con el flag "NO MUEVE
// STOCK" activo (se factura antes de despachar, sin descontar inventario).
// 🧪 Simulado — en producción esto llama a la API de Laudus.
export async function generarFacturaAnticipada(pedidoId: string) {
  const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId } });
  if (!pedido) return { ok: false, error: "Pedido no encontrado" };
  if (!pedido.facturaAnticipada) return { ok: false, error: "Este pedido no es una factura anticipada." };
  if (pedido.facturaNumero) return { ok: false, error: "Este pedido ya tiene una factura emitida." };

  const folio = `FA-${Math.floor(10000000 + Math.random() * 89999999)}`;
  await prisma.pedido.update({
    where: { id: pedidoId },
    data: { facturaNumero: folio, facturaAnticipadaNoMueveStock: true },
  });
  await prisma.historialAccion.create({
    data: {
      area: "cobranzas",
      pedidoId,
      accion: `Factura anticipada generada (NO MUEVE STOCK activo): ${folio}`,
      snapshot: "{}",
    },
  });
  revalidarTodo();
  return { ok: true, folio };
}

// Fila 2 → 3: se enlaza la guía (despacho ya entregado) con la factura
// anticipada. Al ser la última/única guía del pedido, dispara el doble
// chequeo "Desmarcar NO MUEVE STOCK" en el mismo paso.
export async function enlazarGuiaAnticipada(pedidoId: string) {
  const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId } });
  if (!pedido) return { ok: false, error: "Pedido no encontrado" };
  if (!pedido.facturaNumero) return { ok: false, error: "Todavía no se ha generado la factura." };
  if (pedido.columnaDespacho !== "entregado") {
    return { ok: false, error: "La guía todavía no llega a «Entregado» — no se puede enlazar." };
  }
  if (pedido.facturaAnticipadaEnlazada) return { ok: false, error: "Esta guía ya fue enlazada." };

  await prisma.pedido.update({
    where: { id: pedidoId },
    data: { facturaAnticipadaEnlazada: true, facturaAnticipadaNoMueveStock: false },
  });
  await prisma.historialAccion.create({
    data: {
      area: "cobranzas",
      pedidoId,
      accion: `Guía enlazada a ${pedido.facturaNumero} — «No mueve stock» desmarcado en Laudus`,
      snapshot: "{}",
    },
  });
  revalidarTodo();
  return { ok: true };
}
