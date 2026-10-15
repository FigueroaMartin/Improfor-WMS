"use client";

import { useRouter, useSearchParams } from "next/navigation";

// Mismo patrón que Despacho (VistaTabs) — separa el tablero operativo
// (Por preparar → ... → Listo para despacho) de una vista aparte, de solo
// lectura, para lo ya despachado (con filtros y a todo el ancho de
// pantalla, para revisar con calma el orden de lo que salió).
export const VISTA_DEFAULT = "activo" as const;

export default function VistaTabs() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const vista = searchParams.get("vista") || VISTA_DEFAULT;

  function ir(v: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (v === VISTA_DEFAULT) params.delete("vista");
    else params.set("vista", v);
    const qs = params.toString();
    router.push(`/bodega${qs ? `?${qs}` : ""}`);
  }

  return (
    <div className="vista-tabs">
      <button type="button" className={vista === "activo" ? "active" : ""} onClick={() => ir("activo")}>
        Por preparar → Listo para despacho
      </button>
      <button type="button" className={vista === "despachados" ? "active" : ""} onClick={() => ir("despachados")}>
        Despachado
      </button>
    </div>
  );
}
