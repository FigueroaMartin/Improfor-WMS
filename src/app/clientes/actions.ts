"use server";

// Maestro de Clientes — base única de clientes con historial de pedidos y
// preferencias de facturación/despacho. Un cliente puede no tener fila en
// `Cliente` todavía (solo existe como texto en Pedido.cliente); acá se
// muestran igual, con las preferencias en blanco hasta que alguien las
// complete.

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

function revalidarTodo() {
  revalidatePath("/despacho");
  revalidatePath("/cobranzas");
  revalidatePath("/clientes");
}

export type PreferenciasCliente = {
  diasFacturacion?: number | null;
  modalidadFacturacion?: string | null;
  contactoComprador?: string | null;
  contactoPagos?: string | null;
  documentoPreferido?: string | null;
  modoDespachoPreferido?: string | null;
};

// Un cliente = nombre distinto entre los pedidos (fuente real, aunque no
// tenga ficha) union con los que ya tienen ficha propia sin pedidos
// todavía (recién agregados a mano).
export async function obtenerClientes() {
  const [pedidos, fichas] = await Promise.all([
    prisma.pedido.findMany({ where: { columnaDespacho: { not: "eliminado" } }, select: { cliente: true, creadoEn: true } }),
    prisma.cliente.findMany(),
  ]);

  const porNombre = new Map<string, { nombre: string; pedidos: number; ultimoPedido: Date | null }>();
  for (const p of pedidos) {
    const actual = porNombre.get(p.cliente);
    if (!actual) {
      porNombre.set(p.cliente, { nombre: p.cliente, pedidos: 1, ultimoPedido: p.creadoEn });
    } else {
      actual.pedidos += 1;
      if (p.creadoEn > (actual.ultimoPedido ?? new Date(0))) actual.ultimoPedido = p.creadoEn;
    }
  }
  for (const f of fichas) {
    if (!porNombre.has(f.nombre)) porNombre.set(f.nombre, { nombre: f.nombre, pedidos: 0, ultimoPedido: null });
  }

  const fichaPorNombre = new Map(fichas.map((f) => [f.nombre, f]));
  return [...porNombre.values()]
    .map((c) => ({ ...c, ficha: fichaPorNombre.get(c.nombre) ?? null }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export async function obtenerDetalleCliente(nombre: string) {
  const [ficha, pedidos] = await Promise.all([
    prisma.cliente.findUnique({ where: { nombre } }),
    prisma.pedido.findMany({
      where: { cliente: nombre },
      include: { productos: true },
      orderBy: { creadoEn: "desc" },
    }),
  ]);
  return { ficha, pedidos };
}

export async function guardarPreferenciasCliente(nombre: string, datos: PreferenciasCliente) {
  if (!nombre.trim()) return { ok: false, error: "Falta el nombre del cliente." };
  await prisma.cliente.upsert({
    where: { nombre },
    create: { nombre, ...datos },
    update: datos,
  });
  revalidarTodo();
  return { ok: true };
}

// Usado por Despacho al clasificar un ingreso — si el cliente tiene
// preferencia guardada, se pre-selecciona sola; si está en blanco, el
// formulario queda igual de vacío que hoy (nada se fuerza).
export async function obtenerPreferenciasDespacho(nombre: string) {
  const ficha = await prisma.cliente.findUnique({
    where: { nombre },
    select: { documentoPreferido: true, modoDespachoPreferido: true },
  });
  return {
    documentoPreferido: ficha?.documentoPreferido ?? null,
    modoDespachoPreferido: ficha?.modoDespachoPreferido ?? null,
  };
}
