import { prisma } from "@/lib/prisma";
import { requireRol } from "@/lib/perfil";
import Board from "./Board";
import Topbar from "@/components/Topbar";
import VistaTabs from "./VistaTabs";

export const dynamic = "force-dynamic";

export default async function ComprasPage() {
  const perfil = await requireRol("compras");
  const ordenes = await prisma.ordenCompra.findMany({ orderBy: { id: "asc" } });

  return (
    <>
      <Topbar
        area="Compras"
        personaNombre={perfil.nombre}
        personaInicial={perfil.inicial}
        colorVar="--purple"
        rol={perfil.rol}
        centro={<VistaTabs />}
      />
      <Board ordenes={ordenes} />
    </>
  );
}
