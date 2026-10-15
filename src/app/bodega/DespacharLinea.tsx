"use client";

import { useRef, useState } from "react";
import { despacharLinea } from "./actions";
import type { PedidoConProductos } from "@/lib/dominio";

// Achica la foto antes de guardarla — mismo criterio que el bulto en el cierre.
function achicarImagen(file: File, maxAncho = 1000, calidad = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("No se pudo leer la imagen"));
      img.onload = () => {
        const escala = Math.min(1, maxAncho / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = img.width * escala;
        canvas.height = img.height * escala;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas no disponible"));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", calidad));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function DespacharLinea({
  linea,
  pedidos,
  onCerrar,
  onDespachado,
}: {
  linea: string;
  pedidos: PedidoConProductos[];
  onCerrar: () => void;
  onDespachado: (historialIds: number[]) => void;
}) {
  // Por defecto vienen todos marcados — quien retira casi siempre se los
  // lleva todos, pero bodega puede destildar los que se quedan.
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set(pedidos.map((p) => p.id)));
  const pedidosSeleccionados = pedidos.filter((p) => seleccionados.has(p.id));
  const bultosPreparados = pedidosSeleccionados.reduce((a, p) => a + (p.bultos ?? 0), 0);
  const [bultos, setBultos] = useState(String(bultosPreparados));
  const [foto, setFoto] = useState<string | null>(null);
  const [tomandoFoto, setTomandoFoto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Al (des)marcar un pedido, recalcula el default de bultos confirmados
  // (bodega igual puede corregirlo a mano si el conteo real difiere).
  function alternar(id: string) {
    setSeleccionados((prev) => {
      const copia = new Set(prev);
      if (copia.has(id)) copia.delete(id);
      else copia.add(id);
      const nuevoTotal = pedidos.filter((p) => copia.has(p.id)).reduce((a, p) => a + (p.bultos ?? 0), 0);
      setBultos(String(nuevoTotal));
      return copia;
    });
  }

  async function onArchivoFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setTomandoFoto(true);
    setAviso(null);
    try {
      setFoto(await achicarImagen(file));
    } catch {
      setAviso("No se pudo procesar la foto. Intenta de nuevo.");
    } finally {
      setTomandoFoto(false);
    }
  }

  async function confirmar() {
    if (pedidosSeleccionados.length === 0) return setAviso("Marca al menos un pedido que se está llevando.");
    if (!foto) return setAviso("Falta la foto de la guía/manifiesto — no se puede cerrar sin ella.");
    setEnviando(true);
    setAviso(null);
    const res = await despacharLinea(
      pedidosSeleccionados.map((p) => p.id),
      Number(bultos),
      foto
    );
    setEnviando(false);
    if (!res.ok || !res.historialIds) {
      setAviso(res.error ?? "No se pudo despachar.");
      return;
    }
    onDespachado(res.historialIds);
  }

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="detalle">
        <button className="close-x" onClick={onCerrar}>
          ✕
        </button>
        <h2>Retiro · {linea}</h2>
        <div className="sub">Marca los pedidos que {linea} se lleva realmente — lo no cargado queda para el próximo retiro</div>

        <table className="productos">
          <thead>
            <tr>
              <th></th>
              <th>Pedido</th>
              <th>Cliente</th>
              <th>Bultos preparados</th>
            </tr>
          </thead>
          <tbody>
            {pedidos.map((p) => (
              <tr key={p.id}>
                <td>
                  <input type="checkbox" checked={seleccionados.has(p.id)} onChange={() => alternar(p.id)} />
                </td>
                <td>{p.id}</td>
                <td>{p.cliente}</td>
                <td>{p.bultos ?? "—"}</td>
              </tr>
            ))}
            <tr>
              <td></td>
              <td colSpan={2} style={{ fontWeight: 700 }}>
                Total preparado (marcados)
              </td>
              <td style={{ fontWeight: 700 }}>{bultosPreparados}</td>
            </tr>
          </tbody>
        </table>

        <div className="field" style={{ margin: "14px 0" }}>
          <div className="label">Confirma cuántos bultos se lleva realmente {linea}</div>
          <input
            type="number"
            min={0}
            className="motivo-select"
            value={bultos}
            onChange={(e) => setBultos(e.target.value)}
          />
          {Number(bultos) !== bultosPreparados ? (
            <p style={{ color: "var(--amber)", fontSize: 12.5, marginTop: 6 }}>
              ⚠ Cuadra parcial — no coincide con lo preparado ({bultosPreparados}) de los pedidos marcados.
            </p>
          ) : (
            <p style={{ color: "var(--teal)", fontSize: 12.5, marginTop: 6 }}>✓ Cuadra con lo preparado.</p>
          )}
        </div>

        <div className="field" style={{ marginBottom: 14 }}>
          <div className="label">Foto de la guía/manifiesto (obligatoria)</div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onArchivoFoto}
            style={{ display: "none" }}
          />
          {foto ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
              <img src={foto} alt="Guía/manifiesto" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line)" }} />
              <button type="button" className="btn-secundario" onClick={() => fileInputRef.current?.click()}>
                📷 Repetir foto
              </button>
              <span style={{ color: "var(--teal)", fontSize: 12.5, fontWeight: 700 }}>✓ Foto lista</span>
            </div>
          ) : (
            <button type="button" className="btn-secundario" style={{ marginTop: 6 }} onClick={() => fileInputRef.current?.click()} disabled={tomandoFoto}>
              {tomandoFoto ? "Procesando…" : "📷 Sacar foto"}
            </button>
          )}
        </div>

        {aviso && <p style={{ color: "var(--red)", fontSize: 12.5, marginBottom: 10 }}>{aviso}</p>}

        <div className="guardar-cerrar">
          <button className="btn-secundario" onClick={onCerrar} disabled={enviando}>
            ‹ Atrás
          </button>
          <button onClick={confirmar} disabled={enviando || !foto || pedidosSeleccionados.length === 0}>
            {enviando ? "Despachando…" : `✓ Confirmar retiro (${pedidosSeleccionados.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}
