"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TIPOS_DOCUMENTO, MODOS_DESPACHO } from "@/lib/dominio";
import { obtenerDetalleCliente, guardarPreferenciasCliente, type PreferenciasCliente } from "./actions";
import type { Cliente, Pedido, Producto } from "@prisma/client";

const MODALIDADES_FACTURACION = ["Parcializada", "Total"];

type ClienteResumen = {
  nombre: string;
  pedidos: number;
  ultimoPedido: Date | null;
  ficha: Cliente | null;
};

function fechaCorta(d: Date | string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function Board({ clientes }: { clientes: ClienteResumen[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busqueda, setBusqueda] = useState("");
  const [seleccionado, setSeleccionado] = useState<string | null>(clientes[0]?.nombre ?? null);
  const [pedidos, setPedidos] = useState<(Pedido & { productos: Producto[] })[]>([]);
  const [prefs, setPrefs] = useState<PreferenciasCliente>({});
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);

  function refrescar() {
    startTransition(() => router.refresh());
  }

  useEffect(() => {
    if (!seleccionado) return;
    setCargando(true);
    setGuardadoOk(false);
    obtenerDetalleCliente(seleccionado).then(({ ficha, pedidos }) => {
      setPrefs({
        diasFacturacion: ficha?.diasFacturacion ?? null,
        modalidadFacturacion: ficha?.modalidadFacturacion ?? null,
        contactoComprador: ficha?.contactoComprador ?? null,
        contactoPagos: ficha?.contactoPagos ?? null,
        documentoPreferido: ficha?.documentoPreferido ?? null,
        modoDespachoPreferido: ficha?.modoDespachoPreferido ?? null,
      });
      setPedidos(pedidos);
      setCargando(false);
    });
  }, [seleccionado]);

  const filtrados = clientes.filter((c) => c.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()));

  async function guardar() {
    if (!seleccionado) return;
    setGuardando(true);
    setGuardadoOk(false);
    const res = await guardarPreferenciasCliente(seleccionado, prefs);
    setGuardando(false);
    if (res.ok) {
      setGuardadoOk(true);
      refrescar();
    }
  }

  return (
    <div className="clientes-layout">
      <aside className="clientes-lista">
        <input
          className="motivo-select"
          placeholder="Buscar cliente…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          style={{ marginBottom: 10 }}
        />
        {filtrados.length === 0 ? (
          <p className="recordatorios-vacio">Sin resultados.</p>
        ) : (
          filtrados.map((c) => (
            <button
              key={c.nombre}
              className={"cliente-item" + (seleccionado === c.nombre ? " activo" : "")}
              onClick={() => setSeleccionado(c.nombre)}
            >
              <span className="cliente-item-nombre">{c.nombre}</span>
              <span className="cliente-item-meta">
                {c.pedidos} pedido{c.pedidos !== 1 ? "s" : ""}
                {c.ficha?.documentoPreferido || c.ficha?.modoDespachoPreferido ? " · ＊" : ""}
              </span>
            </button>
          ))
        )}
      </aside>

      <main className="clientes-detalle">
        {!seleccionado ? (
          <p className="recordatorios-vacio">Elige un cliente de la lista.</p>
        ) : (
          <>
            <h2>{seleccionado}</h2>

            <div className="field" style={{ marginBottom: 16 }}>
              <div className="label" style={{ marginBottom: 6 }}>Preferencias de facturación y despacho</div>
              <p style={{ fontSize: 11.5, color: "var(--ink-soft)", marginBottom: 10 }}>
                En blanco si todavía no se sabe — con valor, se pre-selecciona sola al clasificar un pedido nuevo de
                este cliente en Despacho (no obliga, solo ahorra tener que elegirlo de nuevo cada vez).
              </p>
              <div className="row" style={{ marginBottom: 10 }}>
                <div className="field">
                  <div className="label">Documento preferido</div>
                  <select
                    className="motivo-select"
                    value={prefs.documentoPreferido ?? ""}
                    onChange={(e) => setPrefs({ ...prefs, documentoPreferido: e.target.value || null })}
                  >
                    <option value="">En blanco</option>
                    {TIPOS_DOCUMENTO.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <div className="label">Modo de despacho preferido</div>
                  <select
                    className="motivo-select"
                    value={prefs.modoDespachoPreferido ?? ""}
                    onChange={(e) => setPrefs({ ...prefs, modoDespachoPreferido: e.target.value || null })}
                  >
                    <option value="">En blanco</option>
                    {MODOS_DESPACHO.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="row" style={{ marginBottom: 10 }}>
                <div className="field">
                  <div className="label">Días de facturación (post-entrega)</div>
                  <input
                    type="number"
                    min={0}
                    className="motivo-select"
                    value={prefs.diasFacturacion ?? ""}
                    onChange={(e) => setPrefs({ ...prefs, diasFacturacion: e.target.value ? Number(e.target.value) : null })}
                  />
                </div>
                <div className="field">
                  <div className="label">Modalidad de facturación</div>
                  <select
                    className="motivo-select"
                    value={prefs.modalidadFacturacion ?? ""}
                    onChange={(e) => setPrefs({ ...prefs, modalidadFacturacion: e.target.value || null })}
                  >
                    <option value="">En blanco</option>
                    {MODALIDADES_FACTURACION.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="row" style={{ marginBottom: 10 }}>
                <div className="field">
                  <div className="label">Contacto comprador</div>
                  <input
                    className="motivo-select"
                    value={prefs.contactoComprador ?? ""}
                    onChange={(e) => setPrefs({ ...prefs, contactoComprador: e.target.value || null })}
                  />
                </div>
                <div className="field">
                  <div className="label">Encargado de pagos</div>
                  <input
                    className="motivo-select"
                    value={prefs.contactoPagos ?? ""}
                    onChange={(e) => setPrefs({ ...prefs, contactoPagos: e.target.value || null })}
                  />
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button onClick={guardar} disabled={guardando}>
                  {guardando ? "Guardando…" : "✓ Guardar preferencias"}
                </button>
                {guardadoOk && <span style={{ color: "var(--teal)", fontSize: 12.5, fontWeight: 700 }}>✓ Guardado</span>}
              </div>
            </div>

            <div className="label" style={{ marginBottom: 6 }}>
              Historial de pedidos {!cargando && `(${pedidos.length})`}
            </div>
            {cargando ? (
              <p className="recordatorios-vacio">Cargando…</p>
            ) : pedidos.length === 0 ? (
              <p className="recordatorios-vacio">Este cliente todavía no tiene pedidos.</p>
            ) : (
              <table className="productos">
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>Fecha</th>
                    <th>Documento</th>
                    <th>Modo de despacho</th>
                    <th>Columna</th>
                    <th>Factura</th>
                  </tr>
                </thead>
                <tbody>
                  {pedidos.map((p) => (
                    <tr key={p.id}>
                      <td>{p.id}{p.oc ? ` · ${p.oc}` : ""}</td>
                      <td>{fechaCorta(p.creadoEn)}</td>
                      <td>{p.documento}</td>
                      <td>{p.modoDespacho}</td>
                      <td>{p.columnaDespacho}</td>
                      <td>{p.facturaNumero ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </main>
    </div>
  );
}
