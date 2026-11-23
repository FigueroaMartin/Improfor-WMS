import { requireRol } from "@/lib/perfil";
import Topbar from "@/components/Topbar";
import Board from "./Board";
import { obtenerClientes } from "./actions";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const perfil = await requireRol(["despacho", "bodega"]);
  const clientes = await obtenerClientes();

  return (
    <>
      <Topbar area="Maestro de Clientes" personaNombre={perfil.nombre} personaInicial={perfil.inicial} colorVar={perfil.colorVar} rol={perfil.rol} />
      <Board clientes={clientes} />
    </>
  );
}
