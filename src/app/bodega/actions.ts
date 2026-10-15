"use server";

// Server Actions de Bodega — equivalente real de BodegaAdapter (maqueta
// Fase 1). La columna de Bodega es derivada (ver src/lib/dominio.ts), así
// que "mover" acá en realidad cambia el pedido compartido: eso es lo que
// hace que Despacho/Cobranzas/Vendedores vean el cambio también.

import { prisma } from "@/lib/prisma";
import { calcColumnaBodega, type PedidoConProductos } from "@/lib/dominio";
import { revalidatePath } from "next/cache";
import { avisarBodega, avisarRobinson } from "@/lib/avisos";
import { crearOrdenFlete, obtenerEtiquetaPdfBase64 } from "@/lib/starken";

function revalidarTodo() {
  revalidatePath("/despacho");
  revalidatePath("/bodega");
  revalidatePath("/cobranzas");
  revalidatePath("/vendedores");
  revalidatePath("/repartos");
}

// --- Avisos (campanita) ---------------------------------------------------
// Solo Bodega los consume por ahora. El polling del cliente llama a
// obtenerAvisosBodega() cada cierto tiempo para detectar novedades.

export async function obtenerAvisosBodega() {
  return prisma.aviso.findMany({
    where: { area: "bodega", leido: false },
    orderBy: { creadoEn: "desc" },
    take: 30,
  });
}

export async function marcarAvisoLeido(id: number) {
  await prisma.aviso.update({ where: { id }, data: { leido: true } });
  revalidatePath("/bodega");
}

export async function marcarTodosAvisosLeidos() {
  await prisma.aviso.updateMany({ where: { area: "bodega", leido: false }, data: { leido: true } });
  revalidatePath("/bodega");
}

// --- Recordatorios -------------------------------------------------------
// Notas rápidas para cuando se separa un producto sin ningún documento
// (pedido, salida, OC) que lo respalde — para no perder el rastro.

export async function crearRecordatorio(texto: string, autor?: string) {
  const limpio = texto.trim();
  if (!limpio) return { ok: false, error: "Escribe algo antes de guardar." };
  await prisma.recordatorio.create({ data: { area: "bodega", texto: limpio, autor: autor || null } });
  await avisarBodega(`Nuevo recordatorio${autor ? ` de ${autor}` : ""}: ${limpio.slice(0, 60)}${limpio.length > 60 ? "…" : ""}`);
  revalidatePath("/bodega");
  return { ok: true };
}

export async function resolverRecordatorio(id: number) {
  await prisma.recordatorio.update({ where: { id }, data: { resuelto: true } });
  revalidatePath("/bodega");
  return { ok: true };
}

export async function eliminarRecordatorio(id: number) {
  await prisma.recordatorio.delete({ where: { id } });
  revalidatePath("/bodega");
  return { ok: true };
}

// --- Deshacer ---------------------------------------------------------
// Cada acción que muta un pedido guarda antes una foto de los campos que
// puede llegar a cambiar. "Deshacer" simplemente la vuelve a aplicar.

type SnapshotPedido = {
  columnaDespacho: string;
  caratula: string | null;
  bultos: number | null;
  fotoCapturada: boolean | null;
  fotoDataUrl: string | null;
  medidas: string | null;
  peso: number | null;
  otNumero: string | null;
  firmaCapturada: boolean | null;
  direccionEntrega: string | null;
  comuna: string | null;
  telefonoContacto: string | null;
  numeroGuiaStarken: string | null;
  fotoGuiaRetiro: string | null;
  productos: { id: number; preparado: number; motivoIncompleto: string | null }[];
};

function tomarSnapshot(pedido: PedidoConProductos): SnapshotPedido {
  return {
    columnaDespacho: pedido.columnaDespacho,
    caratula: pedido.caratula,
    bultos: pedido.bultos,
    fotoCapturada: pedido.fotoCapturada,
    fotoDataUrl: pedido.fotoDataUrl,
    medidas: pedido.medidas,
    peso: pedido.peso,
    otNumero: pedido.otNumero,
    firmaCapturada: pedido.firmaCapturada,
    direccionEntrega: pedido.direccionEntrega,
    comuna: pedido.comuna,
    telefonoContacto: pedido.telefonoContacto,
    numeroGuiaStarken: pedido.numeroGuiaStarken,
    fotoGuiaRetiro: pedido.fotoGuiaRetiro,
    productos: pedido.productos.map((p) => ({ id: p.id, preparado: p.preparado, motivoIncompleto: p.motivoIncompleto })),
  };
}

async function guardarHistorial(pedido: PedidoConProductos, accion: string) {
  const registro = await prisma.historialAccion.create({
    data: {
      area: "bodega",
      pedidoId: pedido.id,
      accion,
      snapshot: JSON.stringify(tomarSnapshot(pedido)),
    },
  });
  return registro.id;
}

export async function deshacerAccion(historialId: number) {
  const registro = await prisma.historialAccion.findUnique({ where: { id: historialId } });
  if (!registro) return { ok: false, error: "Ya no se puede deshacer — el historial expiró o ya se deshizo." };

  const snap: SnapshotPedido = JSON.parse(registro.snapshot);
  await prisma.pedido.update({
    where: { id: registro.pedidoId },
    data: {
      columnaDespacho: snap.columnaDespacho,
      caratula: snap.caratula,
      bultos: snap.bultos,
      fotoCapturada: snap.fotoCapturada,
      fotoDataUrl: snap.fotoDataUrl,
      medidas: snap.medidas,
      peso: snap.peso,
      otNumero: snap.otNumero,
      firmaCapturada: snap.firmaCapturada,
      direccionEntrega: snap.direccionEntrega,
      comuna: snap.comuna,
      telefonoContacto: snap.telefonoContacto,
      numeroGuiaStarken: snap.numeroGuiaStarken,
      fotoGuiaRetiro: snap.fotoGuiaRetiro,
    },
  });
  for (const p of snap.productos) {
    await prisma.producto.update({ where: { id: p.id }, data: { preparado: p.preparado, motivoIncompleto: p.motivoIncompleto } });
  }
  await prisma.historialAccion.delete({ where: { id: historialId } });

  revalidarTodo();
  return { ok: true };
}

// Para acciones en lote (despacho por línea): se deshacen todas juntas.
export async function deshacerVarios(historialIds: number[]) {
  for (const id of historialIds) {
    const res = await deshacerAccion(id);
    if (!res.ok) return res;
  }
  return { ok: true };
}

// --- Acciones -----------------------------------------------------------

export async function moverSalida(pedidoId: string, columnaBodegaDestino: string) {
  const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId }, include: { productos: true } });
  if (!pedido) return { ok: false, error: "Pedido no encontrado" };

  const actual = calcColumnaBodega(pedido);
  if (actual && actual.startsWith("retenido")) {
    return {
      ok: false,
      error: "Este pedido está retenido — se libera solo cuando Cobranzas confirme el pago (o se enlace la factura anticipada).",
    };
  }

  if (columnaBodegaDestino === "por_preparar") {
    const historialId = await guardarHistorial(pedido, "Vuelto a «Por preparar»");
    // Deshace el cierre (si lo tenía) y el avance de líneas — volver a
    // preparación desde "Listo para despacho".
    for (const p of pedido.productos) {
      await prisma.producto.update({ where: { id: p.id }, data: { preparado: 0, motivoIncompleto: null } });
    }
    await prisma.pedido.update({
      where: { id: pedidoId },
      data: {
        columnaDespacho: "despacho", // vuelve del real "listo_retiro" al estado previo al cierre
        caratula: null,
        bultos: null,
        fotoCapturada: null,
        fotoDataUrl: null,
        medidas: null,
        peso: null,
        otNumero: null,
        firmaCapturada: null,
        direccionEntrega: null,
        comuna: null,
        telefonoContacto: null,
        numeroGuiaStarken: null,
      },
    });

    // Si ya se había avisado a Robinson que viniera a retirar, hay que
    // retractar — si no, el aviso queda "fantasma" y podría venir a buscar
    // algo que acaba de volver a preparación.
    if (pedido.modoDespacho.toLowerCase().includes("robinson")) {
      const avisosPendientes = await prisma.aviso.updateMany({
        where: { area: "robinson", pedidoId, leido: false },
        data: { leido: true },
      });
      if (avisosPendientes.count > 0) {
        await avisarRobinson(`${pedidoId} volvió a preparación — todavía no lo retires.`, pedidoId);
      }
    }

    revalidarTodo();
    return { ok: true, historialId };
  } else if (columnaBodegaDestino === "salida_bodega") {
    return {
      ok: false,
      error: "«Salida de bodega» la marca Luisana desde Despacho — no se hace desde acá.",
    };
  } else if (columnaBodegaDestino === "listo_despacho") {
    return {
      ok: false,
      error: "Para pasar a «Listo para despacho» usa «Preparar y cerrar despacho» en la tarjeta — hay que registrar los bultos primero.",
    };
  } else if (columnaBodegaDestino === "despachado") {
    return {
      ok: false,
      error: "El despacho se confirma con el botón ✓ Despachado de la tarjeta, no arrastrándola.",
    };
  } else if (columnaBodegaDestino.startsWith("retenido")) {
    return { ok: false, error: "La retención no se marca a mano: depende de la situación de cobro del pedido." };
  } else if (columnaBodegaDestino === "recordatorios") {
    return { ok: false, error: "«Recordatorios» no es una columna de pedidos — usa el formulario para escribir una nota." };
  }

  revalidarTodo();
  return { ok: true };
}

export type DatosCierre = {
  caratula?: string;
  bultos?: number;
  fotoDataUrl?: string; // foto del bulto, o del voucher/factura·boleta en "Cliente retira"
  medidas?: string;
  peso?: number;
  otNumero?: string;
  firmaCapturada?: boolean;
  direccionEntrega?: string;
  comuna?: string;
  telefonoContacto?: string;
  numeroGuiaStarken?: string;
  motivoIncompleto?: string; // solo si hay líneas cortas con stock disponible (§5g.1)
};

// Por preparar (móvil) — cantidad a despachar editable por línea, con el
// candado "¿seguro que son 0 unidades?" ya diseñado en el documento.
export async function actualizarPreparado(pedidoId: string, productoId: number, cantidad: number) {
  const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId }, include: { productos: true } });
  if (!pedido) return { ok: false, error: "Pedido no encontrado" };
  if (calcColumnaBodega(pedido) !== "por_preparar") {
    return { ok: false, error: "Este pedido no está en «Por preparar»." };
  }
  const producto = pedido.productos.find((p) => p.id === productoId);
  if (!producto) return { ok: false, error: "Producto no encontrado." };
  if (cantidad < 0 || cantidad > producto.cantidad) {
    return { ok: false, error: `La cantidad tiene que estar entre 0 y ${producto.cantidad}.` };
  }

  await prisma.producto.update({ where: { id: productoId }, data: { preparado: cantidad } });
  revalidarTodo();
  return { ok: true };
}

// Modo de despacho → qué exige el cierre, tal como en el documento:
// Cliente retira: solo tributario (foto+bultos). Starken: + medidas/peso y
// generar la etiqueta (dirección, comuna, teléfono, N° de guía).
// Starken(Sendu): N° de OT. Normalmente la OT ya la cargó Luisana al
// clasificar el ingreso (otYaCargada=true) — como esa OT ya implica que
// Sendu generó la etiqueta con sus propias medidas, tampoco hace falta
// medidas/peso acá, solo se confirma. Si faltara, se comporta como Starken
// normal (medidas/peso + puede generar una OT nueva con el mismo botón).
// Robinson: + firma. Otros (Chilexpress/etc.): foto sin medidas, sin OT.
function requisitosPorModo(modo: string, otYaCargada: boolean) {
  const m = modo.toLowerCase();
  if (m.includes("starken(sendu)") || m.includes("starken (sendu)")) {
    return { caratulaYBultos: true, medidas: !otYaCargada, ot: true, firma: false, etiqueta: !otYaCargada };
  }
  if (m.includes("starken")) return { caratulaYBultos: true, medidas: true, ot: true, firma: false, etiqueta: true };
  if (m.includes("robinson")) return { caratulaYBultos: true, medidas: false, ot: false, firma: true, etiqueta: false };
  // Cliente retira: sale en su empaque original — sin carátula ni bultos,
  // solo la foto del voucher/factura·boleta firmado como respaldo.
  if (m.includes("cliente retira")) return { caratulaYBultos: false, medidas: false, ot: false, firma: false, etiqueta: false };
  return { caratulaYBultos: true, medidas: false, ot: false, firma: false, etiqueta: false }; // Chilexpress, otros
}

// Integración real con Starken (Web Service Emisión H2H, ambiente QA —
// ver .env). Crea la Orden de Flete y de inmediato trae la etiqueta en PDF
// (base64) para que Bodega la imprima al cerrar el despacho. Dirección/
// comuna/teléfono del destinatario ya vienen en el pedido (desde Laudus,
// igual que cliente/contacto/productos) — no se piden a mano acá.
export async function generarEtiquetaStarken(
  pedidoId: string,
  datos: {
    nombreDestinatario: string;
    direccionEntrega: string;
    comuna: string;
    telefonoContacto: string;
    largo: number;
    ancho: number;
    alto: number;
    peso: number;
  }
) {
  if (!datos.direccionEntrega.trim()) return { ok: false, error: "Falta la dirección de entrega." };
  if (!datos.comuna.trim()) return { ok: false, error: "Falta la comuna." };
  if (!datos.telefonoContacto.trim()) return { ok: false, error: "Falta el teléfono de contacto." };
  if (!datos.largo || !datos.ancho || !datos.alto) return { ok: false, error: "Faltan las medidas del bulto." };
  if (!datos.peso) return { ok: false, error: "Falta el peso del bulto." };

  const of = await crearOrdenFlete({
    nombreDestinatario: datos.nombreDestinatario,
    direccion: datos.direccionEntrega,
    comuna: datos.comuna,
    telefono: datos.telefonoContacto,
    kilos: datos.peso,
    alto: datos.alto,
    ancho: datos.ancho,
    largo: datos.largo,
    contenido: `Pedido ${pedidoId}`,
    // 🧪 Simplificación — este software no maneja precios (viven en
    // Laudus); se declara un valor de referencia bajo, consistente con el
    // ejemplo de la propia documentación de Starken.
    valorDeclarado: 20000,
  });
  if (!of.ok) return { ok: false, error: of.error };

  const etiqueta = await obtenerEtiquetaPdfBase64(of.nroOrdenFlete!);
  if (!etiqueta.ok) {
    // La OF ya se creó en Starken aunque la etiqueta falle acá — igual se
    // guarda el N° real para no perder la OT y poder reintentar la etiqueta.
    return { ok: true, numeroGuiaStarken: of.nroOrdenFlete, etiquetaPdfBase64: null, avisoEtiqueta: etiqueta.error };
  }

  return { ok: true, numeroGuiaStarken: of.nroOrdenFlete, etiquetaPdfBase64: etiqueta.pdfBase64 };
}

export async function cerrarDespacho(pedidoId: string, datos: DatosCierre) {
  const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId }, include: { productos: true } });
  if (!pedido) return { ok: false, error: "Pedido no encontrado" };

  const actual = calcColumnaBodega(pedido);
  if (actual !== "por_preparar") {
    return { ok: false, error: "Este pedido no está en condiciones de cerrarse (¿está retenido o ya despachado?)." };
  }

  // Candado — no se cierra sin foto, ni sin lo que exija el modo de despacho.
  const req = requisitosPorModo(pedido.modoDespacho, !!pedido.numeroGuiaStarken);
  if (req.caratulaYBultos) {
    if (!datos.caratula) return { ok: false, error: "Falta el tamaño de carátula." };
    if (!datos.bultos || datos.bultos < 1) return { ok: false, error: "Indica cuántos bultos son." };
  }
  if (!datos.fotoDataUrl) {
    return { ok: false, error: req.caratulaYBultos ? "Falta la foto del bulto — no se puede cerrar sin ella." : "Falta la foto de la factura/boleta firmada — no se puede cerrar sin ella." };
  }

  if (req.medidas && (!datos.medidas || datos.peso == null)) {
    return { ok: false, error: `${pedido.modoDespacho} exige medidas y peso antes de cerrar.` };
  }
  if (req.ot && !datos.otNumero) {
    return { ok: false, error: `${pedido.modoDespacho} exige el N° de OT antes de cerrar.` };
  }
  if (req.firma && !datos.firmaCapturada) {
    return { ok: false, error: "Robinson exige la firma de recepción antes de cerrar." };
  }
  if (req.etiqueta && !datos.numeroGuiaStarken) {
    return { ok: false, error: "Genera la etiqueta de Starken antes de cerrar el despacho." };
  }

  // §5g.1 — si quedó algo corto (preparado < pedido) y HAY stock para
  // completarlo, hay que elegir: volver a completar o despachar incompleto
  // con motivo. Si no hay stock, es un faltante conocido y no molesta.
  const cortos = pedido.productos.filter((p) => p.preparado < p.cantidad && p.stock >= p.cantidad);
  if (cortos.length > 0 && !datos.motivoIncompleto) {
    return {
      ok: false,
      requiereMotivoIncompleto: true,
      productos: cortos.map((p) => ({ id: p.id, nombre: p.nombre, cantidad: p.cantidad, preparado: p.preparado, stock: p.stock })),
    };
  }

  const historialId = await guardarHistorial(pedido, "Cierre de despacho registrado");

  // El cierre NO despacha todavía — deja el pedido en "listo_retiro" (real,
  // compartida con Luisana como "Listo para retiro" — calcColumnaBodega la
  // muestra acá como "Listo para despacho"). Despachar es un paso aparte,
  // con el botón ✓ de esa columna.
  await prisma.pedido.update({
    where: { id: pedidoId },
    data: {
      columnaDespacho: "listo_retiro",
      caratula: datos.caratula ?? null,
      bultos: datos.bultos ?? null,
      fotoCapturada: true,
      fotoDataUrl: datos.fotoDataUrl,
      medidas: datos.medidas ?? null,
      peso: datos.peso ?? null,
      otNumero: datos.otNumero ?? null,
      firmaCapturada: datos.firmaCapturada ?? false,
      direccionEntrega: datos.direccionEntrega ?? null,
      comuna: datos.comuna ?? null,
      telefonoContacto: datos.telefonoContacto ?? null,
      numeroGuiaStarken: datos.numeroGuiaStarken ?? null,
    },
  });
  if (cortos.length > 0 && datos.motivoIncompleto) {
    for (const p of cortos) {
      await prisma.producto.update({ where: { id: p.id }, data: { motivoIncompleto: datos.motivoIncompleto } });
    }
  }

  // Robinson es transportista interno — el retiro físico se lo coordina él
  // mismo con Bodega, así que le avisamos apenas queda listo.
  if (pedido.modoDespacho.toLowerCase().includes("robinson")) {
    await avisarRobinson(`Tienes un pedido para retirar: ${pedidoId} — ${pedido.cliente}`, pedidoId);
  }

  revalidarTodo();
  return { ok: true, historialId };
}

// Retiro por transportista (§5g.2, modelo tipo Robinson para TODOS los
// transportistas): quien retira se puede llevar solo una parte de los
// pedidos listos de su línea — bodega marca cuáles se llevó realmente,
// el sistema cuadra (preparados vs. confirmados) y exige la foto de la
// guía/manifiesto. Lo no cargado se queda para el próximo retiro.
export async function despacharLinea(pedidoIds: string[], bultosConfirmados: number, fotoGuiaRetiro: string) {
  if (pedidoIds.length === 0) return { ok: false, error: "Marca al menos un pedido que se está llevando." };
  if (!fotoGuiaRetiro) return { ok: false, error: "Falta la foto de la guía/manifiesto del retiro." };

  const pedidos = await prisma.pedido.findMany({ where: { id: { in: pedidoIds } }, include: { productos: true } });
  for (const pedido of pedidos) {
    if (calcColumnaBodega(pedido) !== "listo_despacho") {
      return { ok: false, error: `${pedido.id} ya no está en «Listo para despacho» — refresca la pantalla.` };
    }
  }

  const bultosPreparados = pedidos.reduce((a, p) => a + (p.bultos ?? 0), 0);
  const cuadra = bultosConfirmados === bultosPreparados;

  const historialIds: number[] = [];
  for (const pedido of pedidos) {
    historialIds.push(await guardarHistorial(pedido, `Retirado junto con ${pedidos.length} pedido${pedidos.length !== 1 ? "s" : ""} — guía/manifiesto adjunta`));
  }

  // Cliente retira: se lo llevó en persona, no hay nada que rastrear →
  // entregado directo. Cualquier otro modo: queda "en tránsito".
  for (const pedido of pedidos) {
    const destino = pedido.modoDespacho.toLowerCase().includes("cliente retira") ? "entregado" : "en_transito";
    await prisma.pedido.update({ where: { id: pedido.id }, data: { columnaDespacho: destino, fotoGuiaRetiro } });
  }

  revalidarTodo();
  return { ok: true, cuadra, bultosPreparados, bultosConfirmados, historialIds };
}
