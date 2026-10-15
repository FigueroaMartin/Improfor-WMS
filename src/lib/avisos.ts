// Bandeja de avisos — Fase 2. Cualquier área puede escribir un aviso para
// otra cuando pasa algo que le importa (ver documento: "el aviso es un
// semáforo, no una orden"). Por ahora solo Bodega los consume/notifica.

import { prisma } from "@/lib/prisma";

export async function avisarBodega(mensaje: string, pedidoId?: string) {
  await prisma.aviso.create({
    data: { area: "bodega", mensaje, pedidoId: pedidoId ?? null },
  });
}

export async function avisarRobinson(mensaje: string, pedidoId?: string) {
  await prisma.aviso.create({
    data: { area: "robinson", mensaje, pedidoId: pedidoId ?? null },
  });
}
