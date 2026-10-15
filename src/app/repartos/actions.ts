"use server";

// Server Actions de Robinson (transportista interno, app propia en
// /repartos). Bodega sigue haciendo su checklist de retiro igual que con
// cualquier otro transportista (§5g.2) — lo único nuevo acá es que
// Robinson ve sus propios repartos y cierra la entrega final él mismo
// (foto de la guía firmada + comentarios), en vez de que alguien más lo
// marque "entregado (simulado)" por él.

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

function esRobinson(modoDespacho: string) {
  return modoDespacho.toLowerCase().includes("robinson");
}

function revalidarTodo() {
  revalidatePath("/repartos");
  revalidatePath("/despacho");
  revalidatePath("/bodega");
  revalidatePath("/cobranzas");
  revalidatePath("/vendedores");
}

export async function obtenerPedidosRobinson() {
  const pedidos = await prisma.pedido.findMany({
    where: { columnaDespacho: { in: ["listo_retiro", "en_transito"] } },
    orderBy: { actualizadoEn: "desc" },
  });
  return pedidos.filter((p) => esRobinson(p.modoDespacho));
}

export async function obtenerAvisosRobinson() {
  return prisma.aviso.findMany({ where: { area: "robinson", leido: false }, orderBy: { creadoEn: "desc" } });
}

export async function marcarAvisoLeidoRobinson(id: number) {
  await prisma.aviso.update({ where: { id }, data: { leido: true } });
}

export async function marcarTodosAvisosLeidosRobinson() {
  await prisma.aviso.updateMany({ where: { area: "robinson", leido: false }, data: { leido: true } });
}

// Cierre de entrega — Robinson sube la foto de la guía firmada por quien
// recibió + comentarios opcionales, y cierra su propio reparto. Esto
// también marca la guía como recepcionada para Cobranzas (② Entregas
// Robinson) — ya no hace falta que María José la suba a mano.
export async function cerrarEntregaRobinson(pedidoId: string, foto: string, comentario: string) {
  const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId } });
  if (!pedido) return { ok: false, error: "Pedido no encontrado" };
  if (!esRobinson(pedido.modoDespacho)) return { ok: false, error: "Este pedido no es un reparto de Robinson." };
  if (pedido.columnaDespacho !== "en_transito") {
    return { ok: false, error: "Este reparto todavía no está «En tránsito» — bodega debe confirmar el retiro primero." };
  }
  if (!foto) return { ok: false, error: "Falta la foto de la guía firmada." };

  await prisma.pedido.update({
    where: { id: pedidoId },
    data: {
      columnaDespacho: "entregado",
      fotoEntregaRobinson: foto,
      comentarioEntregaRobinson: comentario.trim() || null,
      guiaRecepcionada: true,
    },
  });
  await prisma.historialAccion.create({
    data: {
      area: "despacho",
      pedidoId,
      accion: `Entregado por Robinson — guía firmada adjunta${comentario.trim() ? `: "${comentario.trim().slice(0, 120)}"` : ""}`,
      snapshot: "{}",
    },
  });
  revalidarTodo();
  return { ok: true };
}

// Historial de Robinson — sus entregas ya cerradas, más recientes primero.
export async function obtenerHistorialRobinson() {
  const pedidos = await prisma.pedido.findMany({
    where: { columnaDespacho: "entregado" },
    orderBy: { actualizadoEn: "desc" },
    take: 30,
  });
  return pedidos.filter((p) => esRobinson(p.modoDespacho) && p.fotoEntregaRobinson);
}

// Reportar un problema en la entrega (ej. cliente no estaba, dirección no
// existe, rechazó el pedido) — en vez de cerrar como entregado, el pedido
// queda parqueado en "🗯 Cachos" de Despacho para que alguien decida el
// siguiente paso (reagendar, contactar al cliente, etc.). Sale de "En
// transporte" porque ya no es responsabilidad de Robinson resolverlo solo.
export async function reportarProblemaRobinson(pedidoId: string, motivo: string, foto?: string | null) {
  const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId } });
  if (!pedido) return { ok: false, error: "Pedido no encontrado" };
  if (!esRobinson(pedido.modoDespacho)) return { ok: false, error: "Este pedido no es un reparto de Robinson." };
  if (pedido.columnaDespacho !== "en_transito") {
    return { ok: false, error: "Este reparto no está «En tránsito»." };
  }
  if (!motivo.trim()) return { ok: false, error: "Cuenta qué pasó con la entrega." };

  await prisma.pedido.update({
    where: { id: pedidoId },
    data: { columnaDespacho: "cachos", ...(foto ? { fotoEntregaRobinson: foto } : {}) },
  });
  await prisma.cacho.create({
    data: {
      area: "despacho",
      pedidoId,
      texto: `🚚 Robinson reportó un problema en la entrega: ${motivo.trim()}`,
    },
  });
  await prisma.historialAccion.create({
    data: { area: "despacho", pedidoId, accion: `Robinson reportó un problema en la entrega: "${motivo.trim().slice(0, 120)}"`, snapshot: "{}" },
  });
  revalidarTodo();
  return { ok: true };
}
