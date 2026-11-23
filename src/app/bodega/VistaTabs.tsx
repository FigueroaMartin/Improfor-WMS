"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Mismo patrón que Despacho (VistaTabs) — 3 vistas: el tablero de
// preparación (Por preparar / Salida de bodega / Pendiente de pago),
// "Listo para despacho" separado (es su propio momento — esperando que
// pase el transportista, no se está preparando nada ahí), y una vista
// aparte de solo lectura para lo ya despachado.
export const VISTA_DEFAULT = "activo" as const;

export const COLUMNAS_POR_VISTA: Record<string, readonly string[]> = {
  activo: ["por_preparar", "salida_bodega", "retenido_pendiente"],
  listo: ["listo_despacho"],
};

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
        Por preparar
      </button>
      <button type="button" className={vista === "listo" ? "active" : ""} onClick={() => ir("listo")} disabled={isPending}>
        {isPending && yendoA === "listo" && <span className="spinner spinner-sm" />}
        Listo para despacho
      </button>
      <button type="button" className={vista === "despachados" ? "active" : ""} onClick={() => ir("despachados")} disabled={isPending}>
        {isPending && yendoA === "despachados" && <span className="spinner spinner-sm" />}
        Despachado
      </button>
    </div>
  );
}
