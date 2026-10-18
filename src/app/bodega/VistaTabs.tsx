"use client";

import { useState, useTransition } from "react";
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
  // router.push() entre vistas es una transición de React — el contenido
  // viejo se queda a la vista sin avisar nada hasta que llega el nuevo, así
  // que el botón que se tocó muestra su propio spinner mientras tanto.
  const [isPending, startTransition] = useTransition();
  const [yendoA, setYendoA] = useState<string | null>(null);

  function ir(v: string) {
    setYendoA(v);
    const params = new URLSearchParams(searchParams.toString());
    if (v === VISTA_DEFAULT) params.delete("vista");
    else params.set("vista", v);
    const qs = params.toString();
    startTransition(() => {
      router.push(`/bodega${qs ? `?${qs}` : ""}`);
    });
  }

  return (
    <div className="vista-tabs">
      <button type="button" className={vista === "activo" ? "active" : ""} onClick={() => ir("activo")} disabled={isPending}>
        {isPending && yendoA === "activo" && <span className="spinner spinner-sm" />}
        Por preparar → Listo para despacho
      </button>
      <button type="button" className={vista === "despachados" ? "active" : ""} onClick={() => ir("despachados")} disabled={isPending}>
        {isPending && yendoA === "despachados" && <span className="spinner spinner-sm" />}
        Despachado
      </button>
    </div>
  );
}
