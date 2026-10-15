"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { crearRecordatorio, resolverRecordatorio, eliminarRecordatorio } from "./actions";
import type { Recordatorio } from "@prisma/client";

export default function Recordatorios({ items, autor }: { items: Recordatorio[]; autor: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);

  function refrescar() {
    startTransition(() => router.refresh());
  }

  async function agregar() {
    if (!texto.trim()) return;
    setEnviando(true);
    await crearRecordatorio(texto, autor);
    setTexto("");
    setEnviando(false);
    refrescar();
  }

  return (
    <div className="recordatorios">
      <p className="recordatorios-ayuda">
        📌 Para cuando se separa un producto sin ningún documento de por medio — anótalo acá para no perder el rastro.
      </p>

      <div className="recordatorio-nuevo">
        <textarea
          className="motivo-textarea"
          placeholder="Ej: Separé 3 cascos F4 para el cliente que llamó, sin pedido todavía…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={2}
        />
        <button onClick={agregar} disabled={enviando || !texto.trim()}>
          {enviando ? "Guardando…" : "+ Agregar recordatorio"}
        </button>
      </div>

      <div className="recordatorios-lista">
        {items.length === 0 && <p className="recordatorios-vacio">No hay recordatorios pendientes.</p>}
        {items.map((r) => (
          <div key={r.id} className="recordatorio-card">
            <p>{r.texto}</p>
            <div className="recordatorio-meta">
              <span>
                {r.autor ? `${r.autor} · ` : ""}
                {new Date(r.creadoEn).toLocaleString("es-CL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </span>
              <div className="recordatorio-acciones">
                <button
                  className="link-btn"
                  onClick={async () => {
                    await resolverRecordatorio(r.id);
                    refrescar();
                  }}
                >
                  ✓ Resuelto
                </button>
                <button
                  className="link-btn recordatorio-borrar"
                  onClick={async () => {
                    await eliminarRecordatorio(r.id);
                    refrescar();
                  }}
                >
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
