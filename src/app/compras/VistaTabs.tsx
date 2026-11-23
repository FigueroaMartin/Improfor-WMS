"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Sub-tab del área Compras, en la barra lateral — el tablero de Marcela
// tiene 4 "lotes" (Gestión / Miami / Ruta a Chile / Cierre); mostrarlos
// todos juntos en una sola fila era demasiado ancho, así que se separan en
// 3 vistas (Miami + Ruta a Chile comparten vista de "En tránsito", son
// ambos el mismo tipo de seguimiento internacional). El estado vive en la
// URL (?vista=) igual que en Despacho/Bodega.
export const VISTA_DEFAULT = "gestion" as const;

const VISTAS = [
  { id: "gestion", nombre: "Gestión" },
  { id: "transito", nombre: "En tránsito" },
  { id: "cierre", nombre: "Cierre" },
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
      router.push(`/compras${qs ? `?${qs}` : ""}`);
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
