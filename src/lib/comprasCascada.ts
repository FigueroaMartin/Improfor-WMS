// Conexión Pedido ↔ Compras (§3 Despacho — "asignación de stock en
// cascada" / §3 Compras — "Por pedir" consolidado). No es "use server":
// es un helper de servidor plano, llamado desde los server actions de
// Despacho y Cobranzas cuando un pedido con productos sin stock llega a
// "Por pedir".
//
// Simplificación: en vez de repartir contra el saldo libre de varias OC
// abiertas (cascada completa, ordenando por OC más temprana), consolida
// la demanda en UNA sola línea de "Por pedir" por proveedor+producto — es
// el comportamiento visible que pide el documento ("un producto para
// varios pedidos + reposición se muestra en UNA línea consolidada").

import { prisma } from "@/lib/prisma";

export async function generarOrdenesDesdePedido(pedidoId: string) {
  const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId }, include: { productos: true } });
  if (!pedido) return;

  const sinStock = pedido.productos.filter((p) => p.estado === "falta");

  for (const prod of sinStock) {
    const proveedor = prod.proveedor ?? "Por asignar";
    const faltante = Math.max(1, prod.cantidad - prod.stock);

    const existente = await prisma.ordenCompra.findFirst({
      where: { columna: "por_pedir", proveedor, producto: prod.nombre },
    });

    if (existente) {
      const origenActualizado = existente.origenPedido
        ? `${existente.origenPedido} + ${pedidoId} (${faltante})`
        : `${pedidoId} (${faltante})`;
      await prisma.ordenCompra.update({
        where: { id: existente.id },
        data: { cantidad: existente.cantidad + faltante, origenPedido: origenActualizado },
      });
    } else {
      // Sin recorte de largo — esto es texto en SQLite, no hay límite real,
      // y truncar podía hacer calzar dos SKU/pedidos distintos en el mismo
      // ID y perder una línea de compra en silencio.
      const id = `OC-AUTO-${pedidoId.replace("PED-", "")}-${prod.sku}`;
      const yaExiste = await prisma.ordenCompra.findUnique({ where: { id } });
      if (yaExiste) continue;
      await prisma.ordenCompra.create({
        data: {
          id,
          columna: "por_pedir",
          proveedor,
          producto: prod.nombre,
          cantidad: faltante,
          monto: 0,
          origenPedido: `${pedidoId} (${faltante})`,
        },
      });
    }
  }
}
