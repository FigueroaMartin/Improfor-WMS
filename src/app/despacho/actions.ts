"use server";

// Server Actions de Despacho — equivalente real de ERPAdapter (maqueta
// Fase 1). Antes escribía en localStorage; ahora escribe en SQLite vía
// Prisma. El día de la integración con Laudus, este es el ÚNICO archivo
// que cambia — la UI no se entera.

import { prisma } from "@/lib/prisma";
import type { Pedido } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { avisarBodega } from "@/lib/avisos";
import { COLUMNAS_DESPACHO } from "@/lib/dominio";
import { generarOrdenesDesdePedido } from "@/lib/comprasCascada";

function revalidarTodo() {
  revalidatePath("/despacho");
  revalidatePath("/bodega");
  revalidatePath("/cobranzas");
  revalidatePath("/vendedores");
  revalidatePath("/compras");
}

// --- Historial + deshacer -------------------------------------------------
// Mismo patrón que Bodega: cada acción guarda una foto de los campos que
// puede llegar a cambiar, "deshacer" simplemente la vuelve a aplicar.

type SnapshotDespacho = {
  columnaDespacho: string;
  documento: string;
  modoDespacho: string;
  situacionCobro: string | null;
  facturaAnticipada: boolean;
  adjuntos: string | null;
  motivoNC: string | null;
  abonoMonto: number | null;
  abonoFecha: Date | null;
  abonoNota: string | null;
  abonoRevisado: boolean;
};

function tomarSnapshot(pedido: Pedido): SnapshotDespacho {
  return {
    columnaDespacho: pedido.columnaDespacho,
    documento: pedido.documento,
    modoDespacho: pedido.modoDespacho,
    situacionCobro: pedido.situacionCobro,
    facturaAnticipada: pedido.facturaAnticipada,
    adjuntos: pedido.adjuntos,
    motivoNC: pedido.motivoNC,
    abonoMonto: pedido.abonoMonto,
    abonoFecha: pedido.abonoFecha,
    abonoNota: pedido.abonoNota,
    abonoRevisado: pedido.abonoRevisado,
  };
}

async function guardarHistorial(pedido: Pedido, accion: string) {
  const registro = await prisma.historialAccion.create({
    data: { area: "despacho", pedidoId: pedido.id, accion, snapshot: JSON.stringify(tomarSnapshot(pedido)) },
  });
  return registro.id;
}

export async function obtenerHistorialDespacho(pedidoId: string) {
  return prisma.historialAccion.findMany({
    where: { area: "despacho", pedidoId },
    orderBy: { creadoEn: "desc" },
  });
}

export async function deshacerAccionDespacho(historialId: number) {
  const registro = await prisma.historialAccion.findUnique({ where: { id: historialId } });
  if (!registro) return { ok: false, error: "Ya no se puede deshacer — el historial expiró o ya se deshizo." };

  const snap: SnapshotDespacho = JSON.parse(registro.snapshot);
  await prisma.pedido.update({
    where: { id: registro.pedidoId },
    data: {
      columnaDespacho: snap.columnaDespacho,
      documento: snap.documento,
      modoDespacho: snap.modoDespacho,
      situacionCobro: snap.situacionCobro,
      facturaAnticipada: snap.facturaAnticipada,
      adjuntos: snap.adjuntos,
      motivoNC: snap.motivoNC,
      abonoMonto: snap.abonoMonto,
      abonoFecha: snap.abonoFecha,
      abonoNota: snap.abonoNota,
      abonoRevisado: snap.abonoRevisado,
    },
  });
  await prisma.historialAccion.delete({ where: { id: historialId } });

  revalidarTodo();
  return { ok: true };
}

// --- Acciones -------------------------------------------------------------

export async function moverPedido(pedidoId: string, columnaDestino: string) {
  const antes = await prisma.pedido.findUnique({ where: { id: pedidoId }, include: { productos: true } });
  if (!antes) return { ok: false, error: "Pedido no encontrado" };

  // Producto genérico (§5b.2) — SKU ficticio (solo para cotizar) que
  // bodega no puede preparar. Bloquea el avance a Despacho hasta que el
  // vendedor confirme con el cliente y el SKU real vuelva corregido desde
  // Laudus (hoy: "Avisar al vendedor" desde la ficha del pedido).
  if (columnaDestino === "despacho") {
    const bloqueados = antes.productos.filter((p) => p.estado === "bloqueado");
    if (bloqueados.length > 0) {
      return {
        ok: false,
        error: `No se puede pasar a Despacho: ${bloqueados.map((p) => p.nombre).join(", ")} tiene SKU genérico sin corregir — usa «Avisar al vendedor» en la ficha del pedido.`,
      };
    }

    // Transformación de productos (§5b.1) — hay que confirmar la receta
    // (con stock de cada componente) antes de armar el producto terminado.
    const porTransformar = antes.productos.filter((p) => p.receta && !p.transformado);
    if (porTransformar.length > 0) {
      return {
        ok: false,
        requiereTransformacion: true,
        productos: porTransformar.map((p) => ({
          id: p.id,
          nombre: p.nombre,
          cantidad: p.cantidad,
          componentes: (JSON.parse(p.receta!) as { sku: string; nombre: string; cantidadPorUnidad: number; stockDisponible: number }[]).map(
            (c) => ({ ...c, necesario: c.cantidadPorUnidad * p.cantidad, alcanza: c.stockDisponible >= c.cantidadPorUnidad * p.cantidad })
          ),
        })),
      };
    }
  }

  // Abono en 2 pasos (§5f.5) — un pedido con productos sin stock necesita
  // abono antes de poder pedir a Compras. Paso 1: Luisana ingresa el
  // monto; el pedido queda en "Pendiente de pago" hasta que María José
  // revise la cartola (paso 2, ver Cobranzas).
  if (columnaDestino === "por_pedir") {
    const sinStock = antes.productos.some((p) => p.estado === "falta");
    if (sinStock && antes.abonoMonto == null) {
      return {
        ok: false,
        requiereAbono: true,
        error: "Este pedido tiene productos sin stock — necesita un abono antes de pedir a Compras.",
      };
    }
  }

  // Conexión Pedido ↔ Compras: si igual queda algún producto sin stock
  // (por ejemplo, ya tenía el abono resuelto de antes), genera/consolida
  // su línea en "Por pedir" de Compras. Se hace ANTES de mover el pedido —
  // si esto falla, el pedido se queda donde estaba en vez de quedar
  // marcado "Por pedir" sin su línea correspondiente en Compras.
  if (columnaDestino === "por_pedir") {
    await generarOrdenesDesdePedido(pedidoId);
  }

  const nombreCol = COLUMNAS_DESPACHO.find((c) => c.id === columnaDestino)?.nombre ?? columnaDestino;
  const historialId = await guardarHistorial(antes, `Movido a «${nombreCol}»`);

  await prisma.pedido.update({
    where: { id: pedidoId },
    data: { columnaDespacho: columnaDestino, nuevo: false },
  });

  // Recién entra al radar de Bodega (Luisana lo mandó a preparar).
  if (!["salida_bodega", "despacho"].includes(antes.columnaDespacho) && ["salida_bodega", "despacho"].includes(columnaDestino)) {
    await avisarBodega(`Nuevo pedido para preparar: ${pedidoId}`, pedidoId);
  }

  revalidarTodo();
  return { ok: true, historialId };
}

// Confirma la transformación de las líneas con receta de un pedido: valida
// que cada componente tenga stock suficiente, marca las líneas como
// transformadas y ejecuta la transformación en Laudus vía API (🧪
// simulado — consume insumos, da de alta el producto terminado) y por
// último completa el paso a Despacho.
export async function confirmarTransformacion(pedidoId: string) {
  const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId }, include: { productos: true } });
  if (!pedido) return { ok: false, error: "Pedido no encontrado" };

  const porTransformar = pedido.productos.filter((p) => p.receta && !p.transformado);
  if (porTransformar.length === 0) return { ok: false, error: "No hay productos pendientes de transformar." };

  for (const p of porTransformar) {
    const componentes = JSON.parse(p.receta!) as { sku: string; nombre: string; cantidadPorUnidad: number; stockDisponible: number }[];
    const faltantes = componentes.filter((c) => c.stockDisponible < c.cantidadPorUnidad * p.cantidad);
    if (faltantes.length > 0) {
      return {
        ok: false,
        error: `Falta stock de ${faltantes.map((c) => c.nombre).join(", ")} para armar «${p.nombre}».`,
      };
    }
  }

  for (const p of porTransformar) {
    await prisma.producto.update({ where: { id: p.id }, data: { transformado: true } });
  }

  await guardarHistorial(
    pedido,
    `Transformación ejecutada vía API de Laudus (simulado): ${porTransformar.map((p) => p.nombre).join(", ")}`
  );

  revalidarTodo();
  return { ok: true };
}

// Paso 1 del abono en 2 pasos (§5f.5): Luisana ingresa el monto — el
// pedido queda en "Pendiente de pago" (María José) y NO avanza a Compras
// todavía. El paso 2 (revisar cartola y liberar) lo hace Cobranzas.
export async function solicitarAbono(pedidoId: string, monto: number, nota?: string) {
  const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId } });
  if (!pedido) return { ok: false, error: "Pedido no encontrado" };
  if (!monto || monto < 1) return { ok: false, error: "Ingresa un monto válido." };

  const historialId = await guardarHistorial(pedido, `Abono solicitado: $${monto.toLocaleString("es-CL")} — esperando revisión de cartola`);
  await prisma.pedido.update({
    where: { id: pedidoId },
    data: {
      columnaDespacho: "pendiente_pago",
      situacionCobro: "Pendiente de pago",
      abonoMonto: monto,
      abonoFecha: new Date(),
      abonoNota: nota || null,
      abonoRevisado: false,
    },
  });
  revalidarTodo();
  return { ok: true, historialId };
}

// Destinos válidos al clasificar un ingreso — acotados a propósito (pedido
// de Luisana) para reducir el margen de error. "Pendiente de pago" se
// sigue alcanzando solo, vía el abono en 2 pasos (solicitarAbono);
// "Pendiente" y "Cachos" quedan como columnas del tablero, ya no como
// destino manual de clasificación.
const DESTINOS_INGRESO = ["por_pedir", "salida_bodega", "despacho"];

// Clasificación de "Ingreso" (§3 Despacho): Luisana define documento + modo
// de despacho + columna destino — cliente/contacto/productos/vendedor ya
// vienen de Laudus, no se tocan acá. Es el único camino para sacar un
// pedido de "Ingreso" (no se arrastra a mano).
export async function clasificarIngreso(
  pedidoId: string,
  datos: {
    documento: string;
    modoDespacho: string;
    columnaDestino: string;
    otSendu?: string;
    situacionCobro?: string | null;
    facturaAnticipada?: boolean;
  }
) {
  const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId }, include: { productos: true } });
  if (!pedido) return { ok: false, error: "Pedido no encontrado" };
  if (pedido.columnaDespacho !== "ingreso") {
    return { ok: false, error: "Este pedido ya fue clasificado." };
  }
  if (!datos.documento.trim()) return { ok: false, error: "Falta el documento." };
  if (!datos.modoDespacho.trim()) return { ok: false, error: "Falta el modo de despacho." };
  if (!DESTINOS_INGRESO.includes(datos.columnaDestino)) return { ok: false, error: "Elige una columna destino válida." };

  // Starken(Sendu): la OT la genera Sendu al armar el pedido en el
  // e-commerce — Luisana ya la tiene a mano acá, así que se carga en el
  // ingreso en vez de pedírsela a Bodega al cerrar el despacho.
  const esSendu = datos.modoDespacho.toLowerCase().includes("starken(sendu)") || datos.modoDespacho.toLowerCase().includes("starken (sendu)");
  if (esSendu && !datos.otSendu?.trim()) {
    return { ok: false, error: "Starken(Sendu) exige el N° de OT que ya generó Sendu." };
  }

  // Mismo candado que moverPedido: si el pedido tiene productos sin stock,
  // no puede ir directo a "Por pedir" sin el abono (§5f.5).
  if (datos.columnaDestino === "por_pedir" && pedido.productos.some((p) => p.estado === "falta")) {
    return {
      ok: false,
      error: "Este pedido tiene productos sin stock — clasifícalo a otra columna y pide el abono antes de mandarlo a «Por pedir».",
    };
  }

  const nombreCol = COLUMNAS_DESPACHO.find((c) => c.id === datos.columnaDestino)?.nombre ?? datos.columnaDestino;
  const historialId = await guardarHistorial(
    pedido,
    `Ingreso clasificado → «${nombreCol}» (${datos.documento}, ${datos.modoDespacho})`
  );

  await prisma.pedido.update({
    where: { id: pedidoId },
    data: {
      documento: datos.documento.trim(),
      modoDespacho: datos.modoDespacho,
      columnaDespacho: datos.columnaDestino,
      situacionCobro: datos.situacionCobro ?? null,
      facturaAnticipada: datos.facturaAnticipada ?? false,
      nuevo: false,
      ...(esSendu ? { numeroGuiaStarken: datos.otSendu!.trim() } : {}),
    },
  });

  if (["salida_bodega", "despacho"].includes(datos.columnaDestino)) {
    await avisarBodega(`Nuevo pedido para preparar: ${pedidoId}`, pedidoId);
  }

  revalidarTodo();
  return { ok: true, historialId };
}

export async function eliminarPedido(pedidoId: string, motivo: string) {
  const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId } });
  if (!pedido) return { ok: false, error: "Pedido no encontrado" };

  const historialId = await guardarHistorial(pedido, `Pedido eliminado — motivo: ${motivo}`);
  await prisma.pedido.update({
    where: { id: pedidoId },
    data: { columnaDespacho: "eliminado", motivoNC: motivo },
  });
  revalidatePath("/despacho");
  revalidatePath("/cobranzas");
  return { ok: true, historialId };
}

// --- Tarjeta de Luisana: campos que ella marca directamente -------------

export async function actualizarSituacionCobro(pedidoId: string, situacion: string | null) {
  const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId } });
  if (!pedido) return { ok: false, error: "Pedido no encontrado" };

  const historialId = await guardarHistorial(pedido, `Situación de cobro → ${situacion ?? "sin marcar"}`);
  await prisma.pedido.update({ where: { id: pedidoId }, data: { situacionCobro: situacion } });
  revalidarTodo();
  return { ok: true, historialId };
}

// Independiente de "Situación de cobro" — un pedido puede ser factura
// anticipada y a la vez estar "Pendiente de pago" (o ninguna de las dos).
export async function actualizarFacturaAnticipada(pedidoId: string, valor: boolean) {
  const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId } });
  if (!pedido) return { ok: false, error: "Pedido no encontrado" };

  const historialId = await guardarHistorial(pedido, `Factura anticipada → ${valor ? "sí" : "no"}`);
  await prisma.pedido.update({ where: { id: pedidoId }, data: { facturaAnticipada: valor } });
  revalidarTodo();
  return { ok: true, historialId };
}

export async function actualizarDocumento(pedidoId: string, documento: string) {
  const limpio = documento.trim();
  if (!limpio) return { ok: false, error: "El documento no puede quedar vacío." };
  const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId } });
  if (!pedido) return { ok: false, error: "Pedido no encontrado" };

  const historialId = await guardarHistorial(pedido, `Documento → ${limpio}`);
  await prisma.pedido.update({ where: { id: pedidoId }, data: { documento: limpio } });
  revalidatePath("/despacho");
  return { ok: true, historialId };
}

// --- Adjuntos (instrucciones de embalaje, etc.) — se imprimen en bodega -

type Adjunto = { nombre: string; dataUrl: string; subidoEn: string };

export async function agregarAdjunto(pedidoId: string, nombre: string, dataUrl: string) {
  const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId } });
  if (!pedido) return { ok: false, error: "Pedido no encontrado" };

  const historialId = await guardarHistorial(pedido, `Adjunto agregado: ${nombre}`);
  const actuales: Adjunto[] = pedido.adjuntos ? JSON.parse(pedido.adjuntos) : [];
  actuales.push({ nombre, dataUrl, subidoEn: new Date().toISOString() });
  await prisma.pedido.update({ where: { id: pedidoId }, data: { adjuntos: JSON.stringify(actuales) } });
  revalidatePath("/despacho");
  revalidatePath("/bodega");
  return { ok: true, historialId };
}

export async function eliminarAdjunto(pedidoId: string, indice: number) {
  const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId } });
  if (!pedido) return { ok: false, error: "Pedido no encontrado" };
  const actuales: Adjunto[] = pedido.adjuntos ? JSON.parse(pedido.adjuntos) : [];
  const quitado = actuales[indice];
  if (!quitado) return { ok: false, error: "Adjunto no encontrado" };

  const historialId = await guardarHistorial(pedido, `Adjunto eliminado: ${quitado.nombre}`);
  actuales.splice(indice, 1);
  await prisma.pedido.update({ where: { id: pedidoId }, data: { adjuntos: JSON.stringify(actuales) } });
  revalidatePath("/despacho");
  revalidatePath("/bodega");
  return { ok: true, historialId };
}

// --- Cachos ---------------------------------------------------------------
// Problemas/incidencias que se conversan con comentarios — no son un
// recordatorio de una línea, son un hilo (ej. un descuadre raro, un
// cliente difícil, algo que no calzó y hay que ir dejando registro).

export async function obtenerCachos() {
  return prisma.cacho.findMany({
    where: { area: "despacho" },
    include: { comentarios: { orderBy: { creadoEn: "asc" } } },
    orderBy: { creadoEn: "desc" },
  });
}

export async function crearCacho(texto: string, autor?: string, pedidoId?: string) {
  const limpio = texto.trim();
  if (!limpio) return { ok: false, error: "Escribe algo antes de guardar." };
  await prisma.cacho.create({
    data: { area: "despacho", texto: limpio, autor: autor || null, pedidoId: pedidoId || null },
  });
  revalidatePath("/despacho");
  return { ok: true };
}

export async function comentarCacho(cachoId: number, texto: string, autor?: string) {
  const limpio = texto.trim();
  if (!limpio) return { ok: false, error: "Escribe un comentario." };
  await prisma.cachoComentario.create({ data: { cachoId, texto: limpio, autor: autor || null } });
  revalidatePath("/despacho");
  return { ok: true };
}

export async function resolverCacho(id: number) {
  await prisma.cacho.update({ where: { id }, data: { resuelto: true } });
  revalidatePath("/despacho");
  return { ok: true };
}

export async function reabrirCacho(id: number) {
  await prisma.cacho.update({ where: { id }, data: { resuelto: false } });
  revalidatePath("/despacho");
  return { ok: true };
}

export async function eliminarCacho(id: number) {
  await prisma.cacho.delete({ where: { id } });
  revalidatePath("/despacho");
  return { ok: true };
}

// --- Confirmación de entrega ------------------------------------------
// 🧪 Simulado — hoy Luisana lo marca a mano; cuando exista la API de
// Starken/Chilexpress, esto lo dispara el webhook/polling de esa
// integración (ver §6 del documento) y deja de ser manual.
export async function marcarEntregado(pedidoId: string) {
  const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId } });
  if (!pedido) return { ok: false, error: "Pedido no encontrado" };
  if (pedido.columnaDespacho !== "en_transito") {
    return { ok: false, error: "Este pedido no está «En tránsito»." };
  }

  const historialId = await guardarHistorial(pedido, "Marcado como entregado (simulado)");
  await prisma.pedido.update({ where: { id: pedidoId }, data: { columnaDespacho: "entregado" } });
  revalidarTodo();
  return { ok: true, historialId };
}

// --- Producto genérico (§5b.2) ------------------------------------------
// El software NO corrige el SKU — solo avisa al vendedor para que hable
// con el cliente y lo corrija en Laudus. Mientras tanto, el pedido queda
// parqueado en "Cachos" (igual que cualquier otro pedido en espera) con
// el aviso como primer comentario del hilo.
export async function avisarVendedorGenerico(pedidoId: string) {
  const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId }, include: { productos: true } });
  if (!pedido) return { ok: false, error: "Pedido no encontrado" };

  const bloqueados = pedido.productos.filter((p) => p.estado === "bloqueado");
  if (bloqueados.length === 0) return { ok: false, error: "Este pedido no tiene productos con SKU genérico." };

  const historialId = await guardarHistorial(pedido, `Aviso al vendedor (${pedido.vendedor}) — SKU genérico sin corregir`);
  await prisma.pedido.update({ where: { id: pedidoId }, data: { columnaDespacho: "cachos" } });
  await prisma.cacho.create({
    data: {
      area: "despacho",
      pedidoId,
      texto: `⚠ SKU genérico sin corregir — avisado a ${pedido.vendedor}: ${bloqueados.map((p) => p.nombre).join(", ")}. Esperando que confirme talla/color con el cliente y corrija el SKU en Laudus.`,
    },
  });

  revalidarTodo();
  return { ok: true, historialId };
}

// --- Mover producto entre pedidos (§5b.5) --------------------------------
// Reasignar un ítem de un pedido a otro por emergencias/cambios del
// cliente. Regla clave de Luisana: esto se hace en el SOFTWARE, no en
// Laudus — el software es la fuente de la operación de despacho; al
// confirmar, la modificación se sincroniza con Laudus por API (simulado).

export async function moverProductoEntrePedidos(
  origenPedidoId: string,
  productoId: number,
  cantidad: number,
  destinoPedidoId: string,
  motivo: string
) {
  if (destinoPedidoId === origenPedidoId) return { ok: false, error: "El pedido destino tiene que ser distinto del origen." };
  if (!motivo) return { ok: false, error: "Elige un motivo." };
  if (!cantidad || cantidad < 1) return { ok: false, error: "Indica cuántas unidades mover." };

  const origen = await prisma.pedido.findUnique({ where: { id: origenPedidoId }, include: { productos: true } });
  if (!origen) return { ok: false, error: "Pedido de origen no encontrado" };
  const destino = await prisma.pedido.findUnique({ where: { id: destinoPedidoId }, include: { productos: true } });
  if (!destino) return { ok: false, error: `No existe el pedido «${destinoPedidoId}».` };

  const producto = origen.productos.find((p) => p.id === productoId);
  if (!producto) return { ok: false, error: "Producto no encontrado en el pedido de origen." };
  if (cantidad > producto.cantidad) return { ok: false, error: `Solo hay ${producto.cantidad} unidades en ${origenPedidoId}.` };

  const quedaEnOrigen = producto.cantidad - cantidad;
  if (quedaEnOrigen > 0) {
    await prisma.producto.update({ where: { id: producto.id }, data: { cantidad: quedaEnOrigen } });
  } else {
    await prisma.producto.delete({ where: { id: producto.id } });
  }

  const existenteEnDestino = destino.productos.find((p) => p.sku === producto.sku);
  if (existenteEnDestino) {
    await prisma.producto.update({
      where: { id: existenteEnDestino.id },
      data: { cantidad: existenteEnDestino.cantidad + cantidad },
    });
  } else {
    await prisma.producto.create({
      data: {
        pedidoId: destinoPedidoId,
        sku: producto.sku,
        nombre: producto.nombre,
        cantidad,
        stock: producto.stock,
        estado: producto.estado,
        preparado: 0,
      },
    });
  }

  const detalle = `${cantidad} × ${producto.nombre} — motivo: ${motivo}`;
  await guardarHistorial(origen, `Producto movido a ${destinoPedidoId}: ${detalle}`);
  await guardarHistorial(destino, `Producto recibido desde ${origenPedidoId}: ${detalle}`);

  if (quedaEnOrigen === 0) {
    await avisarBodega(
      `${origenPedidoId} quedó con un faltante tras mover un producto a ${destinoPedidoId} — revisar reabastecimiento.`,
      origenPedidoId
    );
  }

  revalidarTodo();
  return { ok: true };
}
