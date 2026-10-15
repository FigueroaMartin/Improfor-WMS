import { prisma } from "@/lib/prisma";
import { calcColumnaBodega } from "@/lib/dominio";
import { requireRol } from "@/lib/perfil";
import Board from "./Board";
import Topbar from "@/components/Topbar";
import VistaTabs from "./VistaTabs";

export const dynamic = "force-dynamic";

export default async function BodegaPage() {
  const perfil = await requireRol("bodega");

  const pedidos = await prisma.pedido.findMany({
    where: { columnaDespacho: { not: "eliminado" } },
    include: { productos: true },
    orderBy: { creadoEn: "asc" },
  });

  const items = pedidos
    .map((p) => ({ ...p, columnaBodega: calcColumnaBodega(p) }))
    .filter((p): p is typeof p & { columnaBodega: string } => p.columnaBodega !== null);

  const recordatorios = await prisma.recordatorio.findMany({
    where: { area: "bodega", resuelto: false },
    orderBy: { creadoEn: "desc" },
  });

  const avisos = await prisma.aviso.findMany({
    where: { area: "bodega", leido: false },
    orderBy: { creadoEn: "desc" },
    take: 30,
  });

  return (
    <>
      <Topbar
        area="Bodega"
        personaNombre={perfil.nombre}
        personaInicial={perfil.inicial}
        colorVar="--blue"
        rol={perfil.rol}
        centro={<VistaTabs />}
      />
      <Board items={items} recordatorios={recordatorios} autor={perfil.nombre} avisosIniciales={avisos} />
    </>
  );
}
