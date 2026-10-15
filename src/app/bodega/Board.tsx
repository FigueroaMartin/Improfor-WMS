"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { COLUMNAS_BODEGA, LINEAS_LISTO_DESPACHO, lineaTransportista, filaRetenidoPago, type PedidoConProductos } from "@/lib/dominio";
import { VISTA_DEFAULT } from "./VistaTabs";
import { moverSalida, deshacerAccion, deshacerVarios, actualizarPreparado } from "./actions";
import CierreDespacho from "./CierreDespacho";
import DespacharLinea from "./DespacharLinea";
import Recordatorios from "./Recordatorios";
import AvisosBell from "./AvisosBell";
import type { Recordatorio, Aviso } from "@prisma/client";

type Item = PedidoConProductos & { columnaBodega: string };

// §5g.2 — modelo tipo Robinson para TODOS los transportistas: cualquier
// línea con pedidos listos abre el mismo retiro con checklist + cuadre +
// foto de guía, no solo Starken/Chilexpress.

// Cuánto dura el resaltado de color en la tarjeta que acaba de cambiar.
const DURACION_RESALTADO_MS = 15000;

export default function Board({
  items,
  recordatorios,
  autor,
  avisosIniciales,
}: {
  items: Item[];
  recordatorios: Recordatorio[];
  autor: string;
  avisosIniciales: Aviso[];
}) {
  const router = useRouter();
  const vista = useSearchParams().get("vista") || VISTA_DEFAULT;
  const [, startTransition] = useTransition();
  const [abierto, setAbierto] = useState<Item | null>(null);
  // Filtros de la vista "Despachado" — búsqueda libre (ID o cliente) + por
  // transportista (misma agrupación que "Listo para despacho").
  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtroTransportista, setFiltroTransportista] = useState("");
  const [cerrando, setCerrando] = useState(false);
  const [lineaADespachar, setLineaADespachar] = useState<{ nombre: string; pedidos: Item[] } | null>(null);
  // Solo importa en celular (ver .tabs-columnas en globals.css) — en
  // escritorio todas las columnas se ven igual, una al lado de la otra.
  const [tabMovil, setTabMovil] = useState<string>(COLUMNAS_BODEGA[0].id);
  const dragIdRef = useRef<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ mensaje: string; historialIds: number[] } | null>(null);
  const [resaltados, setResaltados] = useState<Set<string>>(new Set());

  // Cuando refrescar() trae items nuevos del servidor, sincroniza la
  // tarjeta abierta (si sigue abierta) con los datos frescos — así la
  // tabla de "preparado" se actualiza sin cerrar el modal.
  useEffect(() => {
    if (!abierto) return;
    const fresco = items.find((i) => i.id === abierto.id);
    if (fresco && fresco !== abierto) setAbierto(fresco);
  }, [items]);

  function resaltarPedido(pedidoId: string | null) {
    if (!pedidoId) return;
    setResaltados((prev) => new Set(prev).add(pedidoId));
    setTimeout(() => {
      setResaltados((prev) => {
        const copia = new Set(prev);
        copia.delete(pedidoId);
        return copia;
      });
    }, DURACION_RESALTADO_MS);
  }

  function refrescar() {
    startTransition(() => router.refresh());
  }

  function mostrarToast(mensaje: string, historialIds: number[]) {
    setToast({ mensaje, historialIds });
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(t);
  }, [toast]);

  async function deshacer() {
    if (!toast) return;
    const ids = toast.historialIds;
    setToast(null);
    const res = ids.length > 1 ? await deshacerVarios(ids) : await deshacerAccion(ids[0]);
    if (res && res.ok === false) alert(res.error);
    refrescar();
  }

  async function onDrop(columnaId: string) {
    setDragOverCol(null);
    setDragId(null);
    const id = dragIdRef.current;
    dragIdRef.current = null;
    if (!id) return;
    const res = await moverSalida(id, columnaId);
    if (res && res.ok === false) {
      alert(res.error);
    } else if (res.historialId) {
      mostrarToast(`${id} movido a «${COLUMNAS_BODEGA.find((c) => c.id === columnaId)?.nombre}»`, [res.historialId]);
    }
    refrescar();
  }

  function Tarjeta({ p, col }: { p: Item; col: (typeof COLUMNAS_BODEGA)[number] }) {
    const totalPedido = p.productos.reduce((a, x) => a + x.cantidad, 0);
    const totalPreparado = p.productos.reduce((a, x) => a + (x.preparado || 0), 0);
    const completo = totalPreparado === totalPedido;
    const retenido = col.id.startsWith("retenido");
    const disponibles = p.productos.filter((x) => x.estado !== "falta");
    const faltantes = p.productos.filter((x) => x.estado === "falta");
    return (
      <div
        className={"pedido-card" + (dragId === p.id ? " dragging" : "") + (resaltados.has(p.id) ? " recien-cambiado" : "")}
        draggable
        onDragStart={() => { dragIdRef.current = p.id; setDragId(p.id); }}
        onDragEnd={() => setDragId(null)}
        onClick={() => { setAbierto(p); setCerrando(false); }}
      >
        {!completo && !retenido && col.id !== "salida_bodega" && (
          <span className="nuevo-marker" title="Descuadre / incompleto">
            ⚑
          </span>
        )}
        <div className="id">{p.id}</div>
        <div className="cliente">{p.cliente}</div>
        <div className="meta">
          <span className="badge ok">{p.modoDespacho}</span>
          {col.id === "salida_bodega" ? (
            <>
              <span className="badge stock_ok">{disponibles.length} separado{disponibles.length !== 1 ? "s" : ""}</span>
              <span className="badge stock_falta">{faltantes.length} en importación</span>
            </>
          ) : !completo ? (
            <span className="badge stock_falta">
              {totalPreparado}/{totalPedido} preparado
            </span>
          ) : (
            <span className="badge stock_ok">Completo</span>
          )}
        </div>
      </div>
    );
  }

  // Vista aparte para "Despachado" — a todo el ancho (no la grilla de
  // columnas del kanban) y con filtros, pensada para revisar con calma el
  // orden de lo ya despachado en vez de mezclarlo con el trabajo activo.
  function VistaDespachados() {
    const colDespachado = COLUMNAS_BODEGA.find((c) => c.id === "despachado")!;
    const todos = items.filter((p) => p.columnaBodega === "despachado");
    const texto = filtroTexto.trim().toLowerCase();
    const filtrados = todos.filter((p) => {
      if (filtroTransportista && lineaTransportista(p.modoDespacho) !== filtroTransportista) return false;
      if (!texto) return true;
      return p.id.toLowerCase().includes(texto) || p.cliente.toLowerCase().includes(texto);
    });

    return (
      <section className="despachados-vista">
        <div className="despachados-filtros">
          <input
            className="motivo-select"
            style={{ maxWidth: 260 }}
            placeholder="Buscar por N° de pedido o cliente…"
            value={filtroTexto}
            onChange={(e) => setFiltroTexto(e.target.value)}
          />
          <select
            className="motivo-select"
            style={{ maxWidth: 200 }}
            value={filtroTransportista}
            onChange={(e) => setFiltroTransportista(e.target.value)}
          >
            <option value="">Todos los transportistas</option>
            {LINEAS_LISTO_DESPACHO.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
          <span className="count" style={{ marginLeft: "auto" }}>
            {filtrados.length} de {todos.length}
          </span>
        </div>

        {filtrados.length === 0 ? (
          <p className="recordatorios-vacio">No hay pedidos despachados que calcen con el filtro.</p>
        ) : (
          <div className="cards cards-grid">
            {filtrados.map((p) => (
              <Tarjeta key={p.id} p={p} col={colDespachado} />
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <>
      <AvisosBell
        avisosIniciales={avisosIniciales}
        onNuevoAviso={(aviso) => {
          resaltarPedido(aviso.pedidoId);
          refrescar();
        }}
      />

      {vista === "despachados" ? (
        <VistaDespachados />
      ) : (
      <>
      <div className="tabs-columnas">
        {COLUMNAS_BODEGA.filter((col) => col.id !== "despachado").map((col) => (
          <button
            key={col.id}
            className={"tab-columna" + (tabMovil === col.id ? " active" : "")}
            onClick={() => setTabMovil(col.id)}
          >
            {col.nombre}
            <span className="count">
              {items.filter((p) => p.columnaBodega === col.id).length + (col.id === "salida_bodega" ? recordatorios.length : 0)}
            </span>
          </button>
        ))}
      </div>

      <main className="board">
        {COLUMNAS_BODEGA.filter((col) => col.id !== "despachado").map((col) => {
          const colItems = items.filter((p) => p.columnaBodega === col.id);
          const columnaGrande = col.id === "por_preparar" || col.id === "listo_despacho";
          return (
            <div
              key={col.id}
              className={
                "column" +
                (dragOverCol === col.id ? " drop-target" : "") +
                (columnaGrande ? " column-fluida-grande" : " column-fluida") +
                (tabMovil === col.id ? " tab-activa" : " tab-inactiva")
              }
              onDragOver={(e) => {
                e.preventDefault();
                if (dragOverCol !== col.id) setDragOverCol(col.id);
              }}
              onDragLeave={() => setDragOverCol((c) => (c === col.id ? null : c))}
              onDrop={() => onDrop(col.id)}
            >
              <div className="column-head">
                <span className="name">{col.nombre}</span>
                <span className="count">{colItems.length + (col.id === "salida_bodega" ? recordatorios.length : 0)}</span>
              </div>

              {col.id === "retenido_pendiente" ? (
                (() => {
                  const pendientes = colItems.filter((p) => filaRetenidoPago(p) === "pendientes");
                  const pagados = colItems.filter((p) => filaRetenidoPago(p) === "pagados");
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-soft)", textTransform: "uppercase", marginBottom: 6 }}>
                          ① Pendientes ({pendientes.length})
                        </div>
                        {pendientes.length === 0 ? (
                          <p className="recordatorios-vacio">No hay pedidos pendientes de pago.</p>
                        ) : (
                          <div className="cards cards-grid">
                            {pendientes.map((p) => (
                              <Tarjeta key={p.id} p={p} col={col} />
                            ))}
                          </div>
                        )}
                      </div>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-soft)", textTransform: "uppercase", marginBottom: 6 }}>
                          ② Pagados ({pagados.length})
                        </div>
                        {pagados.length === 0 ? (
                          <p className="recordatorios-vacio">Ninguno con pago registrado todavía.</p>
                        ) : (
                          <div className="cards cards-grid">
                            {pagados.map((p) => (
                              <Tarjeta key={p.id} p={p} col={col} />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()
              ) : col.id === "salida_bodega" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-soft)", textTransform: "uppercase", marginBottom: 6 }}>
                      ① Con pedido ({colItems.length})
                    </div>
                    {colItems.length === 0 ? (
                      <p className="recordatorios-vacio">No hay pedidos con salida separada.</p>
                    ) : (
                      <div className="cards cards-grid">
                        {colItems.map((p) => (
                          <Tarjeta key={p.id} p={p} col={col} />
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-soft)", textTransform: "uppercase", marginBottom: 6 }}>
                      ② Sin pedido ({recordatorios.length})
                    </div>
                    <Recordatorios items={recordatorios} autor={autor} />
                  </div>
                </div>
              ) : col.id === "listo_despacho" ? (
                <div className="lineas-transportista">
                  {LINEAS_LISTO_DESPACHO.map((linea) => {
                    const deEstaLinea = colItems.filter((p) => lineaTransportista(p.modoDespacho) === linea);
                    return (
                      <div key={linea} className="linea-transportista">
                        <div className="linea-head">
                          <span>
                            {linea} <span className="count">{deEstaLinea.length}</span>
                          </span>
                          {deEstaLinea.length > 0 && (
                            <button
                              className="despachar-todo-btn"
                              onClick={() => setLineaADespachar({ nombre: linea, pedidos: deEstaLinea })}
                            >
                              🚛 Retiro
                            </button>
                          )}
                        </div>
                        <div className="cards cards-grid">
                          {deEstaLinea.map((p) => (
                            <Tarjeta key={p.id} p={p} col={col} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="cards cards-grid">
                  {colItems.map((p) => (
                    <Tarjeta key={p.id} p={p} col={col} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </main>
      </>
      )}

      {abierto && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setAbierto(null)}>
          <div className="detalle">
            <button className="close-x" onClick={() => setAbierto(null)}>
              ✕
            </button>

            {cerrando ? (
              <CierreDespacho
                pedidoId={abierto.id}
                modoDespacho={abierto.modoDespacho}
                contacto={abierto.contacto}
                cliente={abierto.cliente}
                oc={abierto.oc}
                documento={abierto.documento}
                facturaNumero={abierto.facturaNumero}
                otExistente={abierto.numeroGuiaStarken}
                direccionExistente={abierto.direccionEntrega}
                comunaExistente={abierto.comuna}
                telefonoExistente={abierto.telefonoContacto}
                onVolver={() => setCerrando(false)}
                onCerrado={(historialId) => {
                  setAbierto(null);
                  setCerrando(false);
                  mostrarToast(`${abierto.id}: cierre registrado`, [historialId]);
                  refrescar();
                }}
              />
            ) : (
              <>
                <h2>{abierto.id}</h2>
                <div className="sub">
                  {abierto.cliente} — vendedor {abierto.vendedor} · {abierto.modoDespacho}
                </div>

                <table className="productos">
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Producto</th>
                      <th>Pedido</th>
                      <th>Preparado</th>
                      {abierto.columnaBodega === "por_preparar" && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {abierto.productos.map((prod) =>
                      abierto.columnaBodega === "por_preparar" ? (
                        <tr key={prod.id}>
                          <td>{prod.sku}</td>
                          <td>{prod.nombre}</td>
                          <td>{prod.cantidad}</td>
                          <td>
                            <input
                              type="number"
                              min={0}
                              max={prod.cantidad}
                              className="motivo-select"
                              style={{ width: 64, padding: "3px 6px", fontSize: 12.5 }}
                              defaultValue={prod.preparado}
                              onBlur={(e) => {
                                const n = Number(e.target.value);
                                if (n === prod.preparado) return;
                                if (n === 0 && !confirm(`¿Seguro que son 0 unidades de ${prod.nombre}?`)) {
                                  e.target.value = String(prod.preparado);
                                  return;
                                }
                                actualizarPreparado(abierto.id, prod.id, n).then((res) => {
                                  if (!res.ok) alert(res.error);
                                  refrescar();
                                });
                              }}
                            />
                          </td>
                          <td>
                            <button
                              className="link-btn"
                              onClick={() =>
                                actualizarPreparado(abierto.id, prod.id, prod.cantidad).then((res) => {
                                  if (!res.ok) alert(res.error);
                                  refrescar();
                                })
                              }
                            >
                              ✓ Todo
                            </button>
                          </td>
                        </tr>
                      ) : (
                        <tr key={prod.id}>
                          <td>{prod.sku}</td>
                          <td>{prod.nombre}</td>
                          <td>{prod.cantidad}</td>
                          <td>
                            {prod.preparado}
                            {prod.preparado < prod.cantidad ? " ⚠" : " ✓"}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>

                {abierto.fotoDataUrl && (
                  <div className="field" style={{ marginTop: 14 }}>
                    <div className="label">
                      {abierto.caratula
                        ? `Foto del cierre (${abierto.caratula} · ${abierto.bultos} bulto${abierto.bultos !== 1 ? "s" : ""})`
                        : "Foto factura/boleta"}
                    </div>
                    <img
                      src={abierto.fotoDataUrl}
                      alt="Foto del cierre"
                      style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line)", marginTop: 6 }}
                    />
                  </div>
                )}

                {abierto.fotoGuiaRetiro && (
                  <div className="field" style={{ marginTop: 14 }}>
                    <div className="label">Foto de la guía/manifiesto del retiro</div>
                    <img
                      src={abierto.fotoGuiaRetiro}
                      alt="Guía/manifiesto del retiro"
                      style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line)", marginTop: 6 }}
                    />
                  </div>
                )}

                {abierto.numeroGuiaStarken && (
                  <div className="row" style={{ marginTop: 14 }}>
                    <div className="field">
                      <div className="label">N° guía Starken</div>
                      <div className="value">{abierto.numeroGuiaStarken}</div>
                    </div>
                    <div className="field">
                      <div className="label">Entrega</div>
                      <div className="value">
                        {abierto.direccionEntrega}, {abierto.comuna}
                      </div>
                    </div>
                    <div className="field">
                      <div className="label">Teléfono</div>
                      <div className="value">{abierto.telefonoContacto}</div>
                    </div>
                  </div>
                )}

                {abierto.columnaBodega === "salida_bodega" && (
                  <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 10 }}>
                    🧪 Salida de bodega: Luisana lo dejó marcado así en Despacho porque el pedido viene incompleto —
                    parte llega de importación más adelante. Solo se puede monitorear acá.
                  </p>
                )}

                <div className="guardar-cerrar">
                  {abierto.columnaBodega === "por_preparar" && (
                    <button onClick={() => setCerrando(true)}>🚚 Preparar y cerrar despacho</button>
                  )}
                  {abierto.columnaBodega === "listo_despacho" && (
                    <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: 0 }}>
                      El retiro se confirma desde el botón «🚛 Retiro» de la línea de transportista, no desde acá.
                    </p>
                  )}
                  <button className="btn-secundario" onClick={() => setAbierto(null)}>
                    Cerrar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {lineaADespachar && (
        <DespacharLinea
          linea={lineaADespachar.nombre}
          pedidos={lineaADespachar.pedidos}
          onCerrar={() => setLineaADespachar(null)}
          onDespachado={(historialIds) => {
            const nombre = lineaADespachar.nombre;
            setLineaADespachar(null);
            mostrarToast(`${historialIds.length} pedidos de ${nombre} despachados`, historialIds);
            refrescar();
          }}
        />
      )}

      {toast && (
        <div className="toast-deshacer">
          <span>{toast.mensaje}</span>
          <button onClick={deshacer}>↩ Deshacer</button>
          <button className="toast-cerrar" onClick={() => setToast(null)} aria-label="Cerrar aviso">
            ✕
          </button>
        </div>
      )}
    </>
  );
}
