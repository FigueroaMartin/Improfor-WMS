"use server";

// Server Actions de Gerencia Finanzas (§7 "EN CURSO — Perfil «Gerencia
// Finanzas»") — agenda de pagos a proveedores, generada desde la factura
// del proveedor que Marcela carga en Compras.

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

function revalidarTodo() {
  revalidatePath("/finanzas");
  revalidatePath("/compras");
}

export async function obtenerCuentasPorPagar() {
  return prisma.cuentaPorPagar.findMany({ orderBy: [{ estado: "asc" }, { fechaVencimiento: "asc" }] });
}

// Pop-up "Registrar pago" — fecha, medio, N° de operación, monto (total o
// parcial) y comprobante. Parcial deja saldo con nuevo vencimiento
// (🧪 simplificación — 7 días desde el pago parcial, el documento no fija
// la regla exacta); total marca "Pagada" y envía el egreso a Laudus.
export async function registrarPagoCuenta(
  cuentaId: number,
  datos: { fechaPago: string; medioPago: string; numeroOperacion?: string; monto: number; comprobante?: string }
) {
  const cuenta = await prisma.cuentaPorPagar.findUnique({ where: { id: cuentaId } });
  if (!cuenta) return { ok: false, error: "Cuenta por pagar no encontrada" };
  if (cuenta.estado === "pagada") return { ok: false, error: "Esta cuenta ya está pagada." };
  if (!datos.medioPago) return { ok: false, error: "Elige el medio de pago." };
  if (!datos.monto || datos.monto <= 0) return { ok: false, error: "El monto debe ser mayor a 0." };

  const saldo = cuenta.monto - cuenta.montoPagado;
  if (datos.monto > saldo) return { ok: false, error: `El monto no puede superar el saldo (${saldo.toLocaleString("es-CL")}).` };

  const montoPagado = cuenta.montoPagado + datos.monto;
  const pagadaCompleta = montoPagado >= cuenta.monto;
  const fechaPago = new Date(datos.fechaPago);

  await prisma.cuentaPorPagar.update({
    where: { id: cuentaId },
    data: {
      montoPagado,
      estado: pagadaCompleta ? "pagada" : "parcial",
      medioPago: datos.medioPago,
      numeroOperacion: datos.numeroOperacion || null,
      comprobante: datos.comprobante || null,
      fechaPago,
      fechaVencimiento: pagadaCompleta ? cuenta.fechaVencimiento : new Date(fechaPago.getTime() + 7 * 86400000),
    },
  });
  await prisma.historialAccion.create({
    data: {
      area: "compras",
      pedidoId: cuenta.ordenCompraId,
      accion: pagadaCompleta
        ? `Finanzas pagó la factura ${cuenta.facturaNumero} completa — $${datos.monto.toLocaleString("es-CL")} (${datos.medioPago}) — egreso enviado a Laudus`
        : `Finanzas registró pago parcial de la factura ${cuenta.facturaNumero} — $${datos.monto.toLocaleString("es-CL")} de $${cuenta.monto.toLocaleString("es-CL")} (${datos.medioPago})`,
      snapshot: "{}",
    },
  });
  revalidarTodo();
  return { ok: true, pagadaCompleta };
}
