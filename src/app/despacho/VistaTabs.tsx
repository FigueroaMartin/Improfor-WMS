"use client";

import { useRouter, useSearchParams } from "next/navigation";

// Sub-tab del área Despacho, centrado en la topbar — separa el tablero en
// dos vistas: el flujo activo (Ingreso → Por pedir/Salida de bodega →
// Despacho) y el archivo de lo ya despachado (Listo para retiro → En
// tránsito → Entregado). El estado vive en la URL (?vista=) para que
// Board.tsx (que renderiza el tablero) lo lea con el mismo hook.
export const VISTA_DEFAULT = "ingreso" as const;

export default function VistaTabs() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const vista = searchParams.get("vista") || VISTA_DEFAULT;

  function ir(v: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (v === VISTA_DEFAULT) params.delete("vista");
    else params.set("vista", v);
    const qs = params.toString();
    router.push(`/despacho${qs ? `?${qs}` : ""}`);
  }

  return (
    <div className="vista-tabs">
      <button type="button" className={vista === "ingreso" ? "active" : ""} onClick={() => ir("ingreso")}>
        Ingreso de pedidos
      </button>
      <button type="button" className={vista === "despachados" ? "active" : ""} onClick={() => ir("despachados")}>
        Pedidos despachados
      </button>
    </div>
  );
}
