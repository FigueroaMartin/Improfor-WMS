"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Sub-tab del área Cobranzas, en la barra lateral — el tablero de María
// José tiene 5 columnas; se separan en 3 vistas agrupadas por tipo de
// trabajo (mismo patrón que Despacho/Bodega/Compras). El estado vive en
// la URL (?vista=).
export const VISTA_DEFAULT = "cobrar" as const;

export const VISTAS = [
  { id: "cobrar", nombre: "Por cobrar", columnas: ["no_pagadas", "pagos_parciales"] },
  { id: "facturar", nombre: "Por facturar", columnas: ["pendientes_facturar", "facturas_anticipadas"] },
  { id: "eliminados", nombre: "Eliminados", columnas: ["eliminados_nc"] },
] as const;

export default function VistaTabs() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const vista = searchParams.get("vista") || VISTA_DEFAULT;
  const [isPending, startTransition] = useTransition();
  const [yendoA, setYendoA] = useState<string | null>(null);

  function ir(v: string) {
    setYendoA(v);
    const params = new URLSearchParams(searchParams.toString());
    if (v === VISTA_DEFAULT) params.delete("vista");
    else params.set("vista", v);
    const qs = params.toString();
    startTransition(() => {
      router.push(`/cobranzas${qs ? `?${qs}` : ""}`);
    });
  }

  return (
    <div className="vista-tabs">
      {VISTAS.map((v) => (
        <button key={v.id} type="button" className={vista === v.id ? "active" : ""} onClick={() => ir(v.id)} disabled={isPending}>
          {isPending && yendoA === v.id && <span className="spinner spinner-sm" />}
          {v.nombre}
        </button>
      ))}
    </div>
  );
}
