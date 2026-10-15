import { prisma } from "@/lib/prisma";
import { requireRol } from "@/lib/perfil";
import Board from "./Board";
import Topbar from "@/components/Topbar";
import VistaTabs from "./VistaTabs";
import { obtenerCachos } from "./actions";

export const dynamic = "force-dynamic"; // siempre datos frescos (Fase 2: sin caché sobre la BD)

export default async function DespachoPage() {
  const perfil = await requireRol("despacho");

  const pedidos = await prisma.pedido.findMany({
    where: { columnaDespacho: { not: "eliminado" } },
    include: { productos: true },
    orderBy: { creadoEn: "asc" },
  });
  const cachos = await obtenerCachos();

  return (
    <>
      <Topbar
        area="Despacho"
        personaNombre={perfil.nombre}
        personaInicial={perfil.inicial}
        colorVar="--teal"
        rol={perfil.rol}
        centro={<VistaTabs />}
      />
      <Board pedidos={pedidos} cachos={cachos} autor={perfil.nombre} />
    </>
  );
}
