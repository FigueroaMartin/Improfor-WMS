"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { COLUMNAS_COBRANZAS, type PedidoConProductos } from "@/lib/dominio";
import {
  registrarAbono,
  simularPagoERP,
  subirGuia,
  confirmarAbonoRevisado,
  generarFacturaAnticipada,
  enlazarGuiaAnticipada,
  recordarPago,
  obtenerHistorialCobranza,
  obtenerFichaCliente,
  guardarFichaCliente,
} from "./actions";
import { filaAbono } from "@/lib/dominio";
import type { HistorialAccion, Cliente } from "@prisma/client";

const MODALIDADES_FACTURACION = ["Parcializada", "Total"];

type Item = PedidoConProductos & { columnaCobranza: string };

function clp(n: number) {
  return n.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
}

function fechaCorta(iso: string | Date) {
  return new Date(iso).toLocaleString("es-CL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// §3 Cobranzas — Pendientes de Facturar en 2 filas: ① Starken (automático,
// se sigue por el estado del tracking) y ② Robinson (con guía recepcionada,
// manual o desde su app). El resto de transportistas queda en una 3ª fila.
function filaPendienteFacturar(p: Item): "starken" | "robinson" | "otros" {
  const m = p.modoDespacho.toLowerCase();
  if (m.includes("starken")) return "starken";
  if (m.includes("robinson")) return "robinson";
  return "otros";
}

// 🧪 Simulado — estado del despacho vía el tracking del transportista.
function estadoStarken(p: Item): "En preparación" | "En tránsito" | "Entregado" {
  if (p.columnaDespacho === "entregado") return "Entregado";
  if (p.columnaDespacho === "en_transito") return "En tránsito";
  return "En preparación";
}

// §5f.7/§5f.8 — Facturas Anticipadas en 3 filas.
function filaAnticipada(p: Item): "solicitud" | "emitidas" | "completa" {
  if (!p.facturaNumero) return "solicitud";
  if (!p.facturaAnticipadaEnlazada) return "emitidas";
  return "completa";
}

export default function Board({ items }: { items: Item[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [abierto, setAbierto] = useState<Item | null>(null);
  const [monto, setMonto] = useState("");
  const [historial, setHistorial] = useState<HistorialAccion[]>([]);
  const [recordatorio, setRecordatorio] = useState("");
  const [mostrarRecordatorio, setMostrarRecordatorio] = useState(false);
  const [mostrarFicha, setMostrarFicha] = useState(false);
  // A diferencia de la ficha de cliente, el detalle del pedido parte
  // visible — es justo la info que hoy falta acá; el toggle es para
  // ocultarla cuando no se necesita, no para tener que pedirla cada vez.
  const [mostrarDetallePedido, setMostrarDetallePedido] = useState(true);
  const [ficha, setFicha] = useState<Partial<Cliente>>({});
  const [guardandoFicha, setGuardandoFicha] = useState(false);

  function refrescar() {
    startTransition(() => router.refresh());
  }

  useEffect(() => {
    if (!abierto) return;
    obtenerHistorialCobranza(abierto.id).then(setHistorial);
  }, [abierto?.id]);

  function abrir(c: Item) {
    setAbierto(c);
    setMonto("");
    setMostrarRecordatorio(false);
    setMostrarFicha(false);
    setRecordatorio(
      `Hola, te escribimos de Improfor: tu pedido ${c.id} está listo pero pendiente de pago para poder despacharlo/retirarlo. Cualquier duda, escríbenos.`
    );
    obtenerFichaCliente(c.cliente).then((f) => setFicha(f ?? {}));
  }

  return (
    <>
      <main className="board">
        {COLUMNAS_COBRANZAS.map((col) => {
          const colItems = items.filter((c) => c.columnaCobranza === col.id);
          return (
            <div key={col.id} className="column">
              <div className="column-head">
                <span className="name">{col.nombre}</span>
                <span className="count">{colItems.length}</span>
              </div>
              {col.id === "pagos_parciales" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {(["no_revisado", "revisado"] as const).map((fila) => {
                    const deLaFila = colItems.filter((c) => filaAbono(c) === fila);
                    if (deLaFila.length === 0) return null;
                    return (
                      <div key={fila}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-soft)", textTransform: "uppercase", marginBottom: 6 }}>
                          {fila === "no_revisado" ? "① Abono no revisado" : "② Abono revisado"}
                        </div>
                        <div className="cards">
                          {deLaFila.map((c) => (
                            <div key={c.id} className="pedido-card" onClick={() => abrir(c)}>
                              <div className="id">{c.id}</div>
                              <div className="cliente">{c.cliente}</div>
                              <div className="meta">
                                <span className={`badge ${fila === "no_revisado" ? "pendiente_pago" : "ok"}`}>
                                  Abono {clp(c.abonoMonto ?? 0)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {(() => {
                    const clasicos = colItems.filter((c) => filaAbono(c) === null);
                    if (clasicos.length === 0) return null;
                    return (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-soft)", textTransform: "uppercase", marginBottom: 6 }}>
                          Con factura
                        </div>
                        <div className="cards">
                          {clasicos.map((c) => {
                            const saldo = c.facturaTotal != null ? c.facturaTotal - (c.facturaPagado ?? 0) : null;
                            return (
                              <div key={c.id} className="pedido-card" onClick={() => abrir(c)}>
                                <div className="id">
                                  {c.id}
                                  {c.facturaNumero ? ` · ${c.facturaNumero}` : ""}
                                </div>
                                <div className="cliente">{c.cliente}</div>
                                <div className="meta">
                                  <span className={`badge ${saldo && saldo > 0 ? "pendiente_pago" : "ok"}`}>Saldo {clp(saldo ?? 0)}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : col.id === "pendientes_facturar" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {(["starken", "robinson", "otros"] as const).map((fila) => {
                    const deLaFila = colItems.filter((c) => filaPendienteFacturar(c) === fila);
                    if (deLaFila.length === 0) return null;
                    return (
                      <div key={fila}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-soft)", textTransform: "uppercase", marginBottom: 6 }}>
                          {fila === "starken" ? "① Entregas Starken (automático)" : fila === "robinson" ? "② Entregas Robinson (guía recepcionada)" : "Otros transportistas"}
                        </div>
                        <div className="cards">
                          {deLaFila.map((c) => (
                            <div key={c.id} className="pedido-card" onClick={() => abrir(c)}>
                              <div className="id">{c.id}</div>
                              <div className="cliente">{c.cliente}</div>
                              <div className="meta">
                                {fila === "starken" ? (
                                  <span className={`badge ${estadoStarken(c) === "Entregado" ? "stock_ok" : "ok"}`}>
                                    {estadoStarken(c)}
                                    {estadoStarken(c) === "Entregado" ? " · ✱ Facturar hoy" : ""}
                                  </span>
                                ) : fila === "robinson" ? (
                                  c.guiaRecepcionada ? (
                                    <span className="badge stock_ok">Guía OK</span>
                                  ) : (
                                    <span className="badge stock_falta">Subir guía</span>
                                  )
                                ) : c.guiaRecepcionada ? (
                                  <span className="badge stock_ok">Guía OK</span>
                                ) : (
                                  <span className="badge stock_falta">Subir guía</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : col.id === "facturas_anticipadas" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {(["solicitud", "emitidas", "completa"] as const).map((fila) => {
                    const deLaFila = colItems.filter((c) => filaAnticipada(c) === fila);
                    if (deLaFila.length === 0) return null;
                    return (
                      <div key={fila}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-soft)", textTransform: "uppercase", marginBottom: 6 }}>
                          {fila === "solicitud" ? "① Solicitud" : fila === "emitidas" ? "② Emitidas · enlazando" : "③ Totalmente entregadas"}
                        </div>
                        <div className="cards">
                          {deLaFila.map((c) => (
                            <div key={c.id} className="pedido-card" onClick={() => abrir(c)}>
                              <div className="id">
                                {c.id}
                                {c.facturaNumero ? ` · ${c.facturaNumero}` : ""}
                              </div>
                              <div className="cliente">{c.cliente}</div>
                              <div className="meta">
                                {fila === "solicitud" ? (
                                  <span className="badge factura_anticipada">Falta emitir</span>
                                ) : fila === "emitidas" ? (
                                  <span className="badge pendiente_pago">NO MUEVE STOCK</span>
                                ) : (
                                  <span className="badge stock_ok">✓ Completa</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="cards">
                  {colItems.map((c) => {
                    const saldo = c.facturaTotal != null ? c.facturaTotal - (c.facturaPagado ?? 0) : null;
                    return (
                      <div key={c.id} className="pedido-card" onClick={() => abrir(c)}>
                        <div className="id">
                          {c.id}
                          {c.facturaNumero ? ` · ${c.facturaNumero}` : ""}
                        </div>
                        <div className="cliente">{c.cliente}</div>
                        <div className="meta">
                          {col.id === "eliminados_nc" ? (
                            <span className="badge pendiente_pago">NC pendiente</span>
                          ) : (
                            <span className={`badge ${saldo && saldo > 0 ? "pendiente_pago" : "ok"}`}>
                              Saldo {clp(saldo ?? 0)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </main>

      {abierto && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setAbierto(null)}>
          <div className="detalle">
            <button className="close-x" onClick={() => setAbierto(null)}>
              ✕
            </button>
            <h2>
              {abierto.id}
              {abierto.facturaNumero ? ` · ${abierto.facturaNumero}` : ""}
            </h2>
            <div className="sub">
              {abierto.cliente}{" "}
              <button className="link-btn" style={{ marginLeft: 8 }} onClick={() => setMostrarFicha((v) => !v)}>
                📇 Ficha de cliente
              </button>
              <button className="link-btn" style={{ marginLeft: 8 }} onClick={() => setMostrarDetallePedido((v) => !v)}>
                {mostrarDetallePedido ? "📦 Ocultar detalle del pedido" : "📦 Ver detalle del pedido"}
              </button>
            </div>

            {mostrarDetallePedido && (
              <div className="field" style={{ margin: "10px 0 16px", background: "var(--grey-tint)", borderRadius: 8, padding: 12 }}>
                <div className="row" style={{ marginBottom: 10 }}>
                  <div className="field">
                    <div className="label">Vendedor</div>
                    <div className="value" style={{ fontSize: 12.5 }}>{abierto.vendedor}</div>
                  </div>
                  <div className="field">
                    <div className="label">Contacto</div>
                    <div className="value" style={{ fontSize: 12.5 }}>{abierto.contacto || "—"}</div>
                  </div>
                  <div className="field">
                    <div className="label">Documento</div>
                    <div className="value" style={{ fontSize: 12.5 }}>{abierto.documento}</div>
                  </div>
                  <div className="field">
                    <div className="label">Modo de despacho</div>
                    <div className="value" style={{ fontSize: 12.5 }}>{abierto.modoDespacho}</div>
                  </div>
                </div>
                <div className="row" style={{ marginBottom: 10 }}>
                  <div className="field">
                    <div className="label">Dirección de entrega</div>
                    <div className="value" style={{ fontSize: 12.5 }}>
                      {abierto.direccionEntrega ? `${abierto.direccionEntrega}, ${abierto.comuna ?? ""}` : "—"}
                    </div>
                  </div>
                  <div className="field">
                    <div className="label">Teléfono de contacto</div>
                    <div className="value" style={{ fontSize: 12.5 }}>{abierto.telefonoContacto || "—"}</div>
                  </div>
                  <div className="field">
                    <div className="label">OC</div>
                    <div className="value" style={{ fontSize: 12.5 }}>{abierto.oc || "—"}</div>
                  </div>
                  <div className="field">
                    <div className="label">N° de guía/OT</div>
                    <div className="value" style={{ fontSize: 12.5 }}>{abierto.otNumero || abierto.numeroGuiaStarken || "—"}</div>
                  </div>
                </div>
                <div className="label" style={{ marginBottom: 4 }}>Productos</div>
                <table className="productos">
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Producto</th>
                      <th>Cant.</th>
                      <th>Preparado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {abierto.productos.map((prod) => (
                      <tr key={prod.id}>
                        <td>{prod.sku}</td>
                        <td>{prod.nombre}</td>
                        <td>{prod.cantidad}</td>
                        <td>{prod.preparado}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {mostrarFicha && (() => {
              const despachosCliente = items.filter((i) => i.cliente === abierto.cliente);
              const ultimoStarken = despachosCliente
                .filter((i) => i.modoDespacho.toLowerCase().includes("starken"))
                .sort((a, b) => new Date(b.actualizadoEn).getTime() - new Date(a.actualizadoEn).getTime())[0];
              return (
                <div className="field" style={{ margin: "10px 0 16px", background: "var(--grey-tint)", borderRadius: 8, padding: 12 }}>
                  <div className="row" style={{ marginBottom: 10 }}>
                    <div className="field">
                      <div className="label">Días de facturación (post-entrega)</div>
                      <input
                        type="number"
                        min={0}
                        className="motivo-select"
                        style={{ width: 80 }}
                        value={ficha.diasFacturacion ?? ""}
                        onChange={(e) => setFicha({ ...ficha, diasFacturacion: e.target.value ? Number(e.target.value) : null })}
                      />
                    </div>
                    <div className="field">
                      <div className="label">Modalidad de facturación</div>
                      <select
                        className="motivo-select"
                        value={ficha.modalidadFacturacion ?? ""}
                        onChange={(e) => setFicha({ ...ficha, modalidadFacturacion: e.target.value || null })}
                      >
                        <option value="">Sin definir</option>
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
                        value={ficha.contactoComprador ?? ""}
                        onChange={(e) => setFicha({ ...ficha, contactoComprador: e.target.value || null })}
                      />
                    </div>
                    <div className="field">
                      <div className="label">Encargado de pagos</div>
                      <input
                        className="motivo-select"
                        value={ficha.contactoPagos ?? ""}
                        onChange={(e) => setFicha({ ...ficha, contactoPagos: e.target.value || null })}
                      />
                    </div>
                  </div>
                  <div className="field" style={{ marginBottom: 10 }}>
                    <div className="label">Último estado en Starken</div>
                    <div className="value" style={{ fontSize: 12.5 }}>
                      {ultimoStarken ? `${ultimoStarken.id} — ${estadoStarken(ultimoStarken)}` : "Sin despachos por Starken"}
                    </div>
                  </div>
                  <div className="field" style={{ marginBottom: 10 }}>
                    <div className="label">Documentos / despachos acumulados</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      {despachosCliente.map((d) => (
                        <div key={d.id} style={{ fontSize: 12 }}>
                          {d.id}
                          {d.facturaNumero ? ` · ${d.facturaNumero}` : ""} — {d.columnaCobranza}
                        </div>
                      ))}
                    </div>
                  </div>
                  <button
                    className="link-btn"
                    disabled={guardandoFicha}
                    onClick={async () => {
                      setGuardandoFicha(true);
                      await guardarFichaCliente(abierto.cliente, {
                        diasFacturacion: ficha.diasFacturacion ?? null,
                        modalidadFacturacion: ficha.modalidadFacturacion ?? null,
                        contactoComprador: ficha.contactoComprador ?? null,
                        contactoPagos: ficha.contactoPagos ?? null,
                      });
                      setGuardandoFicha(false);
                    }}
                  >
                    {guardandoFicha ? "Guardando…" : "✓ Guardar ficha"}
                  </button>
                </div>
              );
            })()}

            {abierto.abonoMonto != null && (
              <>
                <div className="row">
                  <div className="field">
                    <div className="label">Monto del abono</div>
                    <div className="value">{clp(abierto.abonoMonto)}</div>
                  </div>
                  <div className="field">
                    <div className="label">Fecha</div>
                    <div className="value">{abierto.abonoFecha ? new Date(abierto.abonoFecha).toLocaleDateString("es-CL") : "—"}</div>
                  </div>
                  <div className="field">
                    <div className="label">Estado</div>
                    <div className="value">{abierto.abonoRevisado ? "✓ Revisado" : "Esperando revisión de cartola"}</div>
                  </div>
                </div>
                {abierto.abonoNota && (
                  <div className="field" style={{ margin: "10px 0" }}>
                    <div className="label">Nota (de Luisana)</div>
                    <div className="value">{abierto.abonoNota}</div>
                  </div>
                )}
                <div className="guardar-cerrar">
                  {!abierto.abonoRevisado ? (
                    <button
                      onClick={async () => {
                        const res = await confirmarAbonoRevisado(abierto.id);
                        if (res && res.ok === false) return alert(res.error);
                        setAbierto(null);
                        refrescar();
                      }}
                    >
                      ✓ Depósito visto en cartola
                    </button>
                  ) : (
                    <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: 0 }}>
                      Ya liberado a «Por pedir» de Compras — queda acá como registro.
                    </p>
                  )}
                </div>
              </>
            )}

            {abierto.facturaTotal != null && (abierto.columnaCobranza === "no_pagadas" || abierto.columnaCobranza === "pagos_parciales") && (
              <>
                <div className="row">
                  <div className="field">
                    <div className="label">Total factura</div>
                    <div className="value">{clp(abierto.facturaTotal ?? 0)}</div>
                  </div>
                  <div className="field">
                    <div className="label">Pagado</div>
                    <div className="value">{clp(abierto.facturaPagado ?? 0)}</div>
                  </div>
                  <div className="field">
                    <div className="label">Saldo</div>
                    <div className="value">{clp((abierto.facturaTotal ?? 0) - (abierto.facturaPagado ?? 0))}</div>
                  </div>
                </div>
                {abierto.columnaCobranza === "pagos_parciales" && (
                  <div className="field" style={{ margin: "14px 0" }}>
                    <div className="label">Registrar abono (saldo pendiente)</div>
                    <input
                      type="number"
                      className="motivo-select"
                      placeholder="Monto pagado"
                      value={monto}
                      onChange={(e) => setMonto(e.target.value)}
                    />
                  </div>
                )}

                {mostrarRecordatorio ? (
                  <div className="field" style={{ margin: "14px 0", background: "var(--amber-tint)", border: "1px solid var(--amber)", borderRadius: 8, padding: 12 }}>
                    <div className="label" style={{ marginBottom: 6 }}>
                      Mensaje al cliente
                    </div>
                    <textarea
                      className="motivo-textarea"
                      rows={3}
                      value={recordatorio}
                      onChange={(e) => setRecordatorio(e.target.value)}
                    />
                    <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                      <button
                        className="link-btn"
                        onClick={async () => {
                          const res = await recordarPago(abierto.id, recordatorio);
                          if (!res.ok) return alert(res.error);
                          obtenerHistorialCobranza(abierto.id).then(setHistorial);
                          setMostrarRecordatorio(false);
                        }}
                      >
                        ✉ Enviar recordatorio
                      </button>
                      <button className="link-btn" onClick={() => setMostrarRecordatorio(false)}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="guardar-cerrar">
                    <button className="btn-secundario" onClick={() => setMostrarRecordatorio(true)}>
                      ✉ Recordar pago
                    </button>
                    {abierto.columnaCobranza === "pagos_parciales" && (
                      <button
                        onClick={async () => {
                          const m = Number(monto || 0);
                          if (m <= 0) return alert("Ingresa un monto válido.");
                          await registrarAbono(abierto.id, m);
                          setAbierto(null);
                          refrescar();
                        }}
                      >
                        Registrar abono
                      </button>
                    )}
                  </div>
                )}
                <p style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 10 }}>
                  🧪 El pago (total o parcial) se detecta solo por API cuando Laudus lo rebaja — acá no se marca nada a
                  mano; si el pedido estaba retenido en Bodega, se libera solo.
                  <br />
                  <button
                    className="link-btn"
                    onClick={async () => {
                      await simularPagoERP(abierto.id);
                      setAbierto(null);
                      refrescar();
                    }}
                  >
                    Simular pago desde Laudus →
                  </button>
                </p>
              </>
            )}

            {abierto.columnaCobranza === "pendientes_facturar" && (() => {
              const fila = filaPendienteFacturar(abierto);
              const listaParaFacturar = fila === "starken" ? estadoStarken(abierto) === "Entregado" : !!abierto.guiaRecepcionada;
              return (
                <>
                  <div className="row">
                    <div className="field">
                      <div className="label">Fila</div>
                      <div className="value">
                        {fila === "starken" ? "① Starken (automático)" : fila === "robinson" ? "② Robinson (guía)" : "Otro transportista"}
                      </div>
                    </div>
                    <div className="field">
                      <div className="label">Modo de despacho</div>
                      <div className="value">{abierto.modoDespacho}</div>
                    </div>
                    <div className="field">
                      <div className="label">Monto estimado</div>
                      <div className="value">{clp(abierto.facturaTotal ?? 0)}</div>
                    </div>
                  </div>
                  {fila === "starken" ? (
                    <div className="field" style={{ margin: "10px 0" }}>
                      <div className="label">Estado (tracking Starken)</div>
                      <div className="value">
                        {estadoStarken(abierto)}
                        {estadoStarken(abierto) === "Entregado" && " — ✱ Facturar hoy"}
                      </div>
                    </div>
                  ) : (
                    <div className="field" style={{ margin: "10px 0" }}>
                      <div className="label">Guía recepcionada</div>
                      <div className="value">{abierto.guiaRecepcionada ? "Sí" : "No"}</div>
                    </div>
                  )}
                  <div className="guardar-cerrar">
                    {fila !== "starken" && !abierto.guiaRecepcionada ? (
                      <button
                        className="btn-secundario"
                        onClick={async () => {
                          await subirGuia(abierto.id);
                          setAbierto(null);
                          refrescar();
                        }}
                      >
                        📎 Subir guía
                      </button>
                    ) : (
                      <button
                        disabled={!listaParaFacturar}
                        className={listaParaFacturar ? "" : "btn-secundario"}
                        onClick={() => {
                          if (!listaParaFacturar) return;
                          alert("Acción simulada — se integrará con Laudus en Fase 3.");
                          setAbierto(null);
                        }}
                      >
                        Solicitar factura
                      </button>
                    )}
                  </div>
                </>
              );
            })()}

            {abierto.columnaCobranza === "facturas_anticipadas" && (() => {
              const fila = filaAnticipada(abierto);
              return (
                <>
                  <div className="row">
                    <div className="field">
                      <div className="label">Fila</div>
                      <div className="value">
                        {fila === "solicitud" ? "① Solicitud" : fila === "emitidas" ? "② Emitidas · enlazando" : "③ Totalmente entregada"}
                      </div>
                    </div>
                    <div className="field">
                      <div className="label">Monto</div>
                      <div className="value">{clp(abierto.facturaTotal ?? 0)}</div>
                    </div>
                    {abierto.facturaNumero && (
                      <div className="field">
                        <div className="label">N° folio</div>
                        <div className="value">{abierto.facturaNumero}</div>
                      </div>
                    )}
                  </div>

                  {fila !== "solicitud" && (
                    <div className="row" style={{ marginBottom: 10 }}>
                      <div className="field">
                        <div className="label">Estado despacho</div>
                        <div className="value">{estadoStarken(abierto)}</div>
                      </div>
                      <div className="field">
                        <div className="label">NO MUEVE STOCK</div>
                        <div className="value">{abierto.facturaAnticipadaNoMueveStock ? "ON" : "OFF (desmarcado)"}</div>
                      </div>
                    </div>
                  )}

                  <div className="guardar-cerrar">
                    {fila === "solicitud" && (
                      <button
                        onClick={async () => {
                          if (!confirm('Se genera la factura con el flag "NO MUEVE STOCK" activo (ON) — se factura antes de despachar, sin descontar inventario. ¿Confirmar?')) return;
                          const res = await generarFacturaAnticipada(abierto.id);
                          if (!res.ok) return alert(res.error);
                          setAbierto(null);
                          refrescar();
                        }}
                      >
                        Generar factura (NO MUEVE STOCK)
                      </button>
                    )}
                    {fila === "emitidas" && (
                      <button
                        disabled={estadoStarken(abierto) !== "Entregado"}
                        className={estadoStarken(abierto) === "Entregado" ? "" : "btn-secundario"}
                        onClick={async () => {
                          if (estadoStarken(abierto) !== "Entregado") return;
                          if (!confirm("Al enlazar esta guía (la última del pedido) también se desmarca «NO MUEVE STOCK» en Laudus para que el inventario se descuente. ¿Confirmar?")) return;
                          const res = await enlazarGuiaAnticipada(abierto.id);
                          if (!res.ok) return alert(res.error);
                          setAbierto(null);
                          refrescar();
                        }}
                      >
                        {estadoStarken(abierto) === "Entregado" ? "🔗 Enlazar guía" : "Esperando que llegue a «Entregado»"}
                      </button>
                    )}
                    {fila === "completa" && (
                      <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: 0 }}>
                        Ciclo completo — guía enlazada y stock cuadrado. Queda acá como registro.
                      </p>
                    )}
                  </div>
                </>
              );
            })()}

            {abierto.columnaCobranza === "eliminados_nc" && (
              <>
                <div className="row">
                  <div className="field">
                    <div className="label">Factura a anular</div>
                    <div className="value">{abierto.facturaNumero}</div>
                  </div>
                  <div className="field">
                    <div className="label">Monto</div>
                    <div className="value">{clp(abierto.facturaTotal ?? 0)}</div>
                  </div>
                  <div className="field">
                    <div className="label">Motivo (de Luisana)</div>
                    <div className="value">{abierto.motivoNC}</div>
                  </div>
                </div>
                <div className="guardar-cerrar">
                  <button onClick={() => { alert("Acción simulada — se integrará con Laudus en Fase 3."); setAbierto(null); }}>
                    Emitir NC manual en Laudus
                  </button>
                </div>
              </>
            )}

            {historial.length > 0 && (
              <div className="field" style={{ marginTop: 14 }}>
                <div className="label">Historial</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 4 }}>
                  {historial.map((h) => (
                    <div key={h.id} style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                      <span style={{ color: "var(--ink)" }}>{h.accion}</span> — {fechaCorta(h.creadoEn)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
