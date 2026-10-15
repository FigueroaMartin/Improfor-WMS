import { prisma } from "@/lib/prisma";
import { requireRol } from "@/lib/perfil";
import Topbar from "@/components/Topbar";
import RepartosBoard from "./RepartosBoard";
import { obtenerPedidosRobinson, obtenerHistorialRobinson } from "./actions";

export const dynamic = "force-dynamic";

export default async function RepartosPage() {
  const perfil = await requireRol("robinson");

  const pedidos = await obtenerPedidosRobinson();
  const historial = await obtenerHistorialRobinson();
  const avisos = await prisma.aviso.findMany({
    where: { area: "robinson", leido: false },
    orderBy: { creadoEn: "desc" },
    take: 30,
  });

  return (
    <>
      <Topbar area="Repartos" personaNombre={perfil.nombre} personaInicial={perfil.inicial} colorVar="--ink" rol={perfil.rol} />
      <RepartosBoard pedidos={pedidos} historial={historial} avisosIniciales={avisos} />
    </>
  );
}
