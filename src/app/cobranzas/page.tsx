import { prisma } from "@/lib/prisma";
import { calcColumnaCobranza } from "@/lib/dominio";
import { requireRol } from "@/lib/perfil";
import Board from "./Board";
import Topbar from "@/components/Topbar";

export const dynamic = "force-dynamic";

export default async function CobranzasPage() {
  const perfil = await requireRol("cobranzas");

  const pedidos = await prisma.pedido.findMany({
    include: { productos: true },
    orderBy: { creadoEn: "asc" },
  });

  const items = pedidos
    .map((p) => ({ ...p, columnaCobranza: calcColumnaCobranza(p) }))
    .filter((p): p is typeof p & { columnaCobranza: string } => p.columnaCobranza !== null);

  return (
    <>
      <Topbar area="Cobranzas" personaNombre={perfil.nombre} personaInicial={perfil.inicial} colorVar="--red" rol={perfil.rol} />
      <Board items={items} />
    </>
  );
}
