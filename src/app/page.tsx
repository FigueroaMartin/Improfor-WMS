import { PERFILES, loginRequerido } from "@/lib/perfil";
import PerfilGrid from "./PerfilGrid";

export const dynamic = "force-dynamic";

export default async function ElegirPerfilPage() {
  const loginOnInicial = await loginRequerido();
  return (
    <div className="perfil-picker">
      <div className="perfil-picker-head">
        <h1>Improfor</h1>
        <p>¿Quién eres? Cada perfil ve solo su propia área.</p>
      </div>
      <PerfilGrid perfiles={PERFILES} loginOnInicial={loginOnInicial} />
    </div>
  );
}
