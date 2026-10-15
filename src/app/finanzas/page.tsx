import { requireRol } from "@/lib/perfil";
import Topbar from "@/components/Topbar";
import FinanzasBoard from "./FinanzasBoard";
import { obtenerCuentasPorPagar } from "./actions";

export const dynamic = "force-dynamic";

export default async function FinanzasPage() {
  const perfil = await requireRol("finanzas");
  const cuentas = await obtenerCuentasPorPagar();

  return (
    <>
      <Topbar area="Gerencia Finanzas" personaNombre={perfil.nombre} personaInicial={perfil.inicial} colorVar="--blue" rol={perfil.rol} />
      <FinanzasBoard cuentas={cuentas} />
    </>
  );
}
