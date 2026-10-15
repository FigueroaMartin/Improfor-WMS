"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LOTES_COMPRAS, COLUMNAS_COMPRAS, MODALIDADES_PAGO_PROVEEDOR, TIPOS_TRANSPORTISTA, RUTAS_PROVEEDOR, MOTIVOS_POSPONER_COMPRA } from "@/lib/dominio";
import {
  moverOrden,
  generarOC,
  emitirOCGrupo,
  guardarBorradorOC,
  confirmarEmisionOC,
  obtenerTramosPago,
  registrarPagoTramo,
  obtenerTransportistas,
  guardarTransportista,
  cambiarActivoTransportista,
  registrarEnvio,
  obtenerProveedores,
  guardarProveedor,
  obtenerOCsParaEmbarcar,
  obtenerCargas,
  crearEmbarque,
  avanzarCarga,
  obtenerHistorialOC,
  agregarComentarioOC,
  obtenerProductosMaestro,
  guardarProductoMaestro,
  obtenerAlertasReposicion,
  generarOCReposicion,
  posponerOC,
  quitarPosposicionOC,
  recepcionarOC,
  obtenerDescuadres,
  cerrarDescuadre,
  obtenerCuentaPorPagar,
  registrarFacturaProveedor,
  obtenerPosposicionesCompra,
  posponerCompraProveedor,
  quitarPosposicionCompra,
} from "./actions";
import type { OrdenCompra, PagoTramo, Transportista, Proveedor, Carga, HistorialAccion, ProductoMaestro, Descuadre, CuentaPorPagar, PosponerCompra } from "@prisma/client";

const CHIP_DESCUADRE: Record<string, { color: string; texto: string }> = {
  sobro: { color: "#2563eb", texto: "＋ Sobró" },
  falto: { color: "#dc2626", texto: "− Faltó" },
  no_llego: { color: "#dc2626", texto: "⊘ No llegó" },
};

type AlertaReposicion = ProductoMaestro & { transito: number; faltante: number };

const COLUMNAS_EMBARQUE = ["transito_miami", "arribado_miami", "transito_chile", "arribado_chile", "cargas_recibidas"];
const NOMBRES_COLUMNAS_EMBARQUE: Record<string, string> = {
  transito_miami: "En tránsito a Miami",
  arribado_miami: "Arribado a Miami",
  transito_chile: "En tránsito a Chile",
  arribado_chile: "Arribado a Chile",
  cargas_recibidas: "Cargas recibidas",
};

const MEDIOS_PAGO = ["Transferencia", "Cheque", "Tarjeta", "Efectivo"];
const COLUMNAS_CON_ENVIO = ["transito_miami", "transito_chile"];

function urlDeRastreo(patron: string | null | undefined, tracking: string) {
  if (!patron) return null;
  return patron.includes("{tracking}") ? patron.replace("{tracking}", encodeURIComponent(tracking)) : patron;
}

function clp(n: number) {
  return n.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
}

function diasDesde(fecha: Date | string) {
  return Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000);
}

function pillPago(fila: string | null) {
  if (fila === "pendientes_despacho") return <span className="badge stock_ok">Pendiente de despacho</span>;
  if (fila === "pendientes_pago") return <span className="badge pendiente_pago">Pendiente de pago</span>;
  if (fila === "pagado") return <span className="badge ok">Pagado</span>;
  return null;
}

const ORDENES_POR_PEDIR = ["Proveedor A-Z", "Más atrasado", "Mayor monto", "Más ítems"] as const;

export default function Board({ ordenes }: { ordenes: OrdenCompra[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [abierto, setAbierto] = useState<OrdenCompra | null>(null);
  const dragIdRef = useRef<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  // "Por pedir" — monitor agrupado por proveedor (§3 Compras).
  const [busquedaProveedor, setBusquedaProveedor] = useState("");
  const [ordenSeleccion, setOrdenSeleccion] = useState<(typeof ORDENES_POR_PEDIR)[number]>("Proveedor A-Z");
  const [proveedorFiltro, setProveedorFiltro] = useState<string | null>(null);

  // Ficha de OC en construcción — campos editables antes de emitir.
  const [condicionPago, setCondicionPago] = useState("");
  const [costoUnitario, setCostoUnitario] = useState("");
  const [nota, setNota] = useState("");
  const [modalidadPago, setModalidadPago] = useState(MODALIDADES_PAGO_PROVEEDOR[0]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Plan de pago por tramos (OC Pendientes, fila roja).
  const [tramos, setTramos] = useState<PagoTramo[]>([]);
  const [tramoAbierto, setTramoAbierto] = useState<number | null>(null);
  const [medioPago, setMedioPago] = useState(MEDIOS_PAGO[0]);
  const [comprobante, setComprobante] = useState("");

  // Maestro de transportistas (§3 Compras).
  const [transportistas, setTransportistas] = useState<Transportista[]>([]);
  const [panelTransportistas, setPanelTransportistas] = useState(false);
  const [tNombre, setTNombre] = useState("");
  const [tTipo, setTTipo] = useState(TIPOS_TRANSPORTISTA[0]);
  const [tUrl, setTUrl] = useState("");
  const [tBusqueda, setTBusqueda] = useState("");

  // "Registrar envío" — transportista + N° de seguimiento de la OC abierta.
  const [envioTransportista, setEnvioTransportista] = useState("");
  const [envioTracking, setEnvioTracking] = useState("");

  // "Factura del proveedor (para el pago)" → Gerencia Finanzas.
  const [cuentaPorPagar, setCuentaPorPagar] = useState<CuentaPorPagar | null>(null);
  const [facturaNumero, setFacturaNumero] = useState("");
  const [facturaFechaEmision, setFacturaFechaEmision] = useState("");
  const [facturaMonto, setFacturaMonto] = useState("");

  // Seguimiento / bitácora de la OC abierta.
  const [historialOC, setHistorialOC] = useState<HistorialAccion[]>([]);
  const [comentarioOC, setComentarioOC] = useState("");

  // Política de stock / alertas de reposición (§5 pendiente #9).
  const [panelStock, setPanelStock] = useState(false);
  const [productosMaestro, setProductosMaestro] = useState<ProductoMaestro[]>([]);
  const [alertasReposicion, setAlertasReposicion] = useState<AlertaReposicion[]>([]);
  const [msSku, setMsSku] = useState("");
  const [msNombre, setMsNombre] = useState("");
  const [msProveedor, setMsProveedor] = useState("");
  const [msStockActual, setMsStockActual] = useState("0");
  const [msMinimo, setMsMinimo] = useState("");
  const [msMaximo, setMsMaximo] = useState("");

  // Posponer OC.
  const [posponiendo, setPosponiendo] = useState(false);
  const [pospFecha, setPospFecha] = useState("");
  const [pospMotivo, setPospMotivo] = useState("");

  // Recepcionar mercadería (descuadres).
  const [recepcionando, setRecepcionando] = useState(false);
  const [cantidadRecibida, setCantidadRecibida] = useState("");
  const [panelDescuadres, setPanelDescuadres] = useState(false);
  const [descuadres, setDescuadres] = useState<Descuadre[]>([]);

  // Posponer compra (§7 "NUEVO — Compras_Posponer_OC") — por grupo de
  // proveedor en "Por pedir".
  const [posposicionesCompra, setPosposicionesCompra] = useState<PosponerCompra[]>([]);
  const [posponiendoCompra, setPosponiendoCompra] = useState<string | null>(null);
  const [pcMotivo, setPcMotivo] = useState(MOTIVOS_POSPONER_COMPRA[0]);
  const [pcFecha, setPcFecha] = useState("");
  const [pcNota, setPcNota] = useState("");

  // Maestro de proveedores — reglas de ruta (§5 pendiente #10).
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [panelProveedores, setPanelProveedores] = useState(false);
  const [pNombre, setPNombre] = useState("");
  const [pCondicionPago, setPCondicionPago] = useState("");
  const [pRuta, setPRuta] = useState<string>(RUTAS_PROVEEDOR[2]);
  const [pBusqueda, setPBusqueda] = useState("");

  // Consolidado de Miami (§5 pendiente #7) — embarques que agrupan OC.
  const [panelEmbarques, setPanelEmbarques] = useState(false);
  const [ocsParaEmbarcar, setOcsParaEmbarcar] = useState<OrdenCompra[]>([]);
  const [cargas, setCargas] = useState<(Carga & { ordenes: OrdenCompra[] })[]>([]);
  const [seleccionEmbarque, setSeleccionEmbarque] = useState<string[]>([]);
  const [embWarehouseReceipt, setEmbWarehouseReceipt] = useState("");
  const [embAwb, setEmbAwb] = useState("");

  useEffect(() => {
    obtenerTransportistas().then(setTransportistas);
    obtenerProveedores().then(setProveedores);
    obtenerAlertasReposicion().then(setAlertasReposicion);
    obtenerDescuadres().then(setDescuadres);
    obtenerPosposicionesCompra().then(setPosposicionesCompra);
  }, []);

  function refrescarTransportistas() {
    obtenerTransportistas().then(setTransportistas);
  }

  function refrescarProveedores() {
    obtenerProveedores().then(setProveedores);
  }

  function refrescarEmbarques() {
    obtenerOCsParaEmbarcar().then(setOcsParaEmbarcar);
    obtenerCargas().then(setCargas);
  }

  function refrescarStock() {
    obtenerProductosMaestro().then(setProductosMaestro);
    obtenerAlertasReposicion().then(setAlertasReposicion);
  }

  function refrescarDescuadres() {
    obtenerDescuadres().then(setDescuadres);
  }

  function refrescarPosposicionesCompra() {
    obtenerPosposicionesCompra().then(setPosposicionesCompra);
  }

  function abrirPosponerCompra(proveedor: string) {
    const existente = posposicionesCompra.find((p) => p.proveedor === proveedor);
    setPcMotivo(existente?.motivo ?? MOTIVOS_POSPONER_COMPRA[0]);
    setPcFecha(existente?.fechaReevaluar ? new Date(existente.fechaReevaluar).toISOString().slice(0, 10) : "");
    setPcNota(existente?.nota ?? "");
    setPosponiendoCompra(proveedor);
  }

  function abrirPanelDescuadres() {
    refrescarDescuadres();
    setPanelDescuadres(true);
  }

  function abrirPanelStock() {
    setMsSku("");
    setMsNombre("");
    setMsProveedor("");
    setMsStockActual("0");
    setMsMinimo("");
    setMsMaximo("");
    refrescarStock();
    setPanelStock(true);
  }

  function abrirPanelEmbarques() {
    setSeleccionEmbarque([]);
    setEmbWarehouseReceipt("");
    setEmbAwb("");
    refrescarEmbarques();
    setPanelEmbarques(true);
  }

  function refrescar() {
    startTransition(() => router.refresh());
  }

  function abrir(o: OrdenCompra) {
    setAbierto(o);
    setCondicionPago(o.condicionPago ?? "");
    setCostoUnitario(o.costoUnitario != null ? String(o.costoUnitario) : "");
    setNota(o.nota ?? "");
    setModalidadPago(o.modalidadPago && MODALIDADES_PAGO_PROVEEDOR.includes(o.modalidadPago) ? o.modalidadPago : MODALIDADES_PAGO_PROVEEDOR[0]);
    setError(null);
    setTramos([]);
    setTramoAbierto(null);
    setEnvioTransportista(o.transportistaNombre ?? "");
    setEnvioTracking(o.tracking ?? "");
    setComentarioOC("");
    setPosponiendo(false);
    setPospFecha("");
    setPospMotivo("");
    setRecepcionando(false);
    setCantidadRecibida(String(o.cantidad));
    setFacturaNumero("");
    setFacturaFechaEmision("");
    setFacturaMonto("");
    obtenerHistorialOC(o.id).then(setHistorialOC);
    if (o.columna === "oc_pendientes" && o.filaPago === "pendientes_pago") {
      obtenerTramosPago(o.id).then(setTramos);
    }
    if (o.modalidadPago) {
      obtenerCuentaPorPagar(o.id).then((c) => {
        setCuentaPorPagar(c);
        if (c) {
          setFacturaNumero(c.facturaNumero);
          setFacturaFechaEmision(new Date(c.facturaFechaEmision).toISOString().slice(0, 10));
          setFacturaMonto(String(c.monto));
        }
      });
    } else {
      setCuentaPorPagar(null);
    }
  }

  async function onDrop(columnaId: string) {
    setDragOverCol(null);
    setDragId(null);
    const id = dragIdRef.current;
    dragIdRef.current = null;
    if (!id) return;
    const res = await moverOrden(id, columnaId);
    if (!res.ok) {
      alert(res.error);
      return;
    }
    refrescar();
  }

  const porPedir = ordenes.filter((o) => o.columna === "por_pedir");

  const proveedoresPorPedir = useMemo(() => {
    const mapa = new Map<string, OrdenCompra[]>();
    for (const o of porPedir) {
      if (!mapa.has(o.proveedor)) mapa.set(o.proveedor, []);
      mapa.get(o.proveedor)!.push(o);
    }
    let lista = [...mapa.entries()].map(([proveedor, lineas]) => ({
      proveedor,
      lineas,
      monto: lineas.reduce((a, l) => a + l.monto, 0),
      masAntiguo: Math.max(...lineas.map((l) => diasDesde(l.creadoEn))),
    }));
    if (busquedaProveedor.trim()) {
      lista = lista.filter((p) => p.proveedor.toLowerCase().includes(busquedaProveedor.toLowerCase()));
    }
    switch (ordenSeleccion) {
      case "Más atrasado":
        lista.sort((a, b) => b.masAntiguo - a.masAntiguo);
        break;
      case "Mayor monto":
        lista.sort((a, b) => b.monto - a.monto);
        break;
      case "Más ítems":
        lista.sort((a, b) => b.lineas.length - a.lineas.length);
        break;
      default:
        lista.sort((a, b) => a.proveedor.localeCompare(b.proveedor));
    }
    return lista;
  }, [porPedir, busquedaProveedor, ordenSeleccion]);

  const lineasAMostrar = proveedorFiltro
    ? porPedir.filter((o) => o.proveedor === proveedorFiltro)
    : porPedir;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "10px 16px" }}>
        <button className="link-btn" onClick={abrirPanelDescuadres}>🔀 Descuadres{descuadres.length > 0 ? ` (${descuadres.length})` : ""}</button>
        <button className="link-btn" onClick={abrirPanelStock}>📊 Stock{alertasReposicion.length > 0 ? ` (${alertasReposicion.length})` : ""}</button>
        <button className="link-btn" onClick={abrirPanelEmbarques}>📦 Consolidado de Miami</button>
        <button className="link-btn" onClick={() => setPanelProveedores(true)}>🏭 Proveedores</button>
        <button className="link-btn" onClick={() => setPanelTransportistas(true)}>🚚 Transportistas</button>
      </div>
      <main className="board board-lotes">
        {LOTES_COMPRAS.map((lote) => (
          <div key={lote.nombre} className="lote">
            <div className="lote-head">{lote.nombre}</div>
            <div className="lote-cols">
              {lote.columnas.map((colId) => {
                const col = COLUMNAS_COMPRAS.find((c) => c.id === colId)!;

                if (colId === "por_pedir") {
                  return (
                    <div
                      key={colId}
                      className={"column column-ancha" + (dragOverCol === colId ? " drop-target" : "")}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (dragOverCol !== colId) setDragOverCol(colId);
                      }}
                      onDragLeave={() => setDragOverCol((c) => (c === colId ? null : c))}
                      onDrop={() => onDrop(colId)}
                    >
                      <div className="column-head">
                        <span className="name">{col.nombre}</span>
                        <span className="count">{porPedir.length}</span>
                      </div>

                      <div style={{ display: "flex", gap: 10 }}>
                        <div style={{ width: 150, flexShrink: 0 }}>
                          <input
                            className="motivo-select"
                            placeholder="Buscar proveedor…"
                            style={{ fontSize: 11.5, padding: "4px 6px", marginBottom: 6 }}
                            value={busquedaProveedor}
                            onChange={(e) => setBusquedaProveedor(e.target.value)}
                          />
                          <select
                            className="motivo-select"
                            style={{ fontSize: 11, padding: "3px 5px", marginBottom: 8 }}
                            value={ordenSeleccion}
                            onChange={(e) => setOrdenSeleccion(e.target.value as any)}
                          >
                            {ORDENES_POR_PEDIR.map((o) => (
                              <option key={o} value={o}>{o}</option>
                            ))}
                          </select>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 260, overflowY: "auto" }}>
                            <button
                              className={"link-btn" + (proveedorFiltro === null ? "" : "")}
                              style={{
                                display: "block", textAlign: "left", fontWeight: proveedorFiltro === null ? 700 : 400,
                                background: proveedorFiltro === null ? "#fff" : undefined, borderColor: proveedorFiltro === null ? "var(--teal)" : undefined,
                              }}
                              onClick={() => setProveedorFiltro(null)}
                            >
                              Todos ({porPedir.length})
                            </button>
                            {proveedoresPorPedir.map((p) => (
                              <button
                                key={p.proveedor}
                                className="link-btn"
                                style={{
                                  display: "block", textAlign: "left", fontWeight: proveedorFiltro === p.proveedor ? 700 : 400,
                                  background: proveedorFiltro === p.proveedor ? "#fff" : undefined, borderColor: proveedorFiltro === p.proveedor ? "var(--teal)" : undefined,
                                }}
                                onClick={() => setProveedorFiltro(p.proveedor)}
                              >
                                {p.proveedor} ({p.lineas.length})
                                {p.masAntiguo >= 5 && <span style={{ color: "var(--red)" }}> · {p.masAntiguo}d</span>}
                                <br />
                                <span style={{ fontSize: 10, color: "var(--ink-soft)" }}>{clp(p.monto)}</span>
                                {posposicionesCompra.some((x) => x.proveedor === p.proveedor) && (
                                  <>
                                    <br />
                                    <span style={{ fontSize: 10, color: "var(--amber)" }}>
                                      ⏸ En espera · {posposicionesCompra.find((x) => x.proveedor === p.proveedor)!.motivo}
                                    </span>
                                  </>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
                          {(proveedorFiltro ? [proveedorFiltro] : proveedoresPorPedir.map((p) => p.proveedor)).map((proveedor) => {
                            const lineas = lineasAMostrar.filter((l) => l.proveedor === proveedor);
                            if (lineas.length === 0) return null;
                            const posposicion = posposicionesCompra.find((x) => x.proveedor === proveedor);
                            return (
                              <div key={proveedor}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                  <span style={{ fontSize: 11.5, fontWeight: 700 }}>
                                    {proveedor}
                                    {posposicion && (
                                      <span style={{ fontWeight: 400, color: "var(--amber)", fontSize: 11 }}> · ⏸ En espera · {posposicion.motivo}</span>
                                    )}
                                  </span>
                                  <div style={{ display: "flex", gap: 6 }}>
                                    <button className="link-btn" onClick={() => abrirPosponerCompra(proveedor)}>
                                      ⏸ {posposicion ? "Editar espera" : "Posponer"}
                                    </button>
                                    <button
                                      className="link-btn"
                                      onClick={async () => {
                                        const res = await emitirOCGrupo(proveedor);
                                        if (!res.ok) return alert(res.error);
                                        refrescarPosposicionesCompra();
                                        refrescar();
                                      }}
                                    >
                                      Emitir OC ({lineas.length})
                                    </button>
                                  </div>
                                </div>
                                <div className="cards">
                                  {lineas.map((o) => (
                                    <div
                                      key={o.id}
                                      className={"pedido-card" + (dragId === o.id ? " dragging" : "")}
                                      draggable
                                      onDragStart={() => { dragIdRef.current = o.id; setDragId(o.id); }}
                                      onDragEnd={() => setDragId(null)}
                                      onClick={() => abrir(o)}
                                    >
                                      <div className="id">{o.id}</div>
                                      <div className="cliente">{o.producto}</div>
                                      <div className="meta">
                                        <span className="badge ok">{clp(o.monto)}</span>
                                        {o.origenPedido && <span className="badge stock_falta">{o.origenPedido}</span>}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                }

                const items = ordenes.filter((o) => o.columna === colId);
                return (
                  <div
                    key={colId}
                    className={"column" + (dragOverCol === colId ? " drop-target" : "")}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (dragOverCol !== colId) setDragOverCol(colId);
                    }}
                    onDragLeave={() => setDragOverCol((c) => (c === colId ? null : c))}
                    onDrop={() => onDrop(colId)}
                  >
                    <div className="column-head">
                      <span className="name">{col.nombre}</span>
                      <span className="count">{items.length}</span>
                    </div>
                    <div className="cards">
                      {items.map((o) => (
                        <div
                          key={o.id}
                          className={"pedido-card" + (dragId === o.id ? " dragging" : "")}
                          draggable
                          onDragStart={() => { dragIdRef.current = o.id; setDragId(o.id); }}
                          onDragEnd={() => setDragId(null)}
                          onClick={() => abrir(o)}
                        >
                          <div className="id">{o.id}</div>
                          <div className="cliente">{o.proveedor}</div>
                          <div className="meta">
                            {o.modalidadPago && pillPago(o.filaPago)}
                            {o.cargaId && <span className="badge">📦 {o.cargaId}</span>}
                            {o.pospuestaHasta && (
                              <span className="badge pendiente_pago">⏳ Pospuesta {new Date(o.pospuestaHasta).toLocaleDateString("es-CL")}</span>
                            )}
                            <span className="badge ok">{clp(o.monto)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </main>

      {abierto && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setAbierto(null)}>
          <div className="detalle">
            <button className="close-x" onClick={() => setAbierto(null)}>
              ✕
            </button>
            <h2>{abierto.id}</h2>
            <div className="sub">{abierto.proveedor}</div>

            <div className="row">
              <div className="field">
                <div className="label">Producto</div>
                <div className="value">{abierto.producto}</div>
              </div>
              <div className="field">
                <div className="label">Cantidad</div>
                <div className="value">{abierto.cantidad}</div>
              </div>
              <div className="field">
                <div className="label">Monto</div>
                <div className="value">{clp(abierto.monto)}</div>
              </div>
              {abierto.origenPedido && (
                <div className="field">
                  <div className="label">Origen / trazabilidad</div>
                  <div className="value">{abierto.origenPedido}</div>
                </div>
              )}
              {abierto.tracking && (
                <div className="field">
                  <div className="label">Tracking</div>
                  <div className="value">{abierto.tracking}</div>
                </div>
              )}
              {abierto.warehouseReceipt && (
                <div className="field">
                  <div className="label">Warehouse Receipt</div>
                  <div className="value">{abierto.warehouseReceipt}</div>
                </div>
              )}
              {abierto.awb && (
                <div className="field">
                  <div className="label">N° guía aérea (AWB)</div>
                  <div className="value">{abierto.awb}</div>
                </div>
              )}
            </div>

            {abierto.columna !== "cargas_recibidas" && (
              <div className="row" style={{ marginTop: 10, gap: 10 }}>
                {abierto.columna !== "por_pedir" && abierto.columna !== "oc_construccion" && (
                  <div className="field">
                    {abierto.pospuestaHasta ? (
                      <>
                        <div className="label">Pospuesta</div>
                        <div className="value" style={{ fontSize: 12 }}>
                          hasta {new Date(abierto.pospuestaHasta).toLocaleDateString("es-CL")} — {abierto.pospuestaMotivo}
                        </div>
                        <button
                          className="link-btn"
                          onClick={async () => {
                            await quitarPosposicionOC(abierto.id);
                            refrescar();
                          }}
                        >
                          Quitar posposición
                        </button>
                      </>
                    ) : posponiendo ? (
                      <>
                        <div className="label">Posponer hasta</div>
                        <input type="date" className="motivo-select" value={pospFecha} onChange={(e) => setPospFecha(e.target.value)} />
                        <input
                          className="motivo-select"
                          placeholder="Motivo del atraso"
                          style={{ marginTop: 6 }}
                          value={pospMotivo}
                          onChange={(e) => setPospMotivo(e.target.value)}
                        />
                        <div style={{ marginTop: 6 }}>
                          <button
                            className="link-btn"
                            onClick={async () => {
                              const res = await posponerOC(abierto.id, pospFecha, pospMotivo);
                              if (!res.ok) return alert(res.error);
                              setPosponiendo(false);
                              refrescar();
                            }}
                          >
                            Confirmar
                          </button>{" "}
                          <button className="link-btn" onClick={() => setPosponiendo(false)}>Cancelar</button>
                        </div>
                      </>
                    ) : (
                      <button className="link-btn" onClick={() => setPosponiendo(true)}>⏳ Posponer OC</button>
                    )}
                  </div>
                )}

                {abierto.columna !== "por_pedir" && abierto.columna !== "oc_construccion" && (
                  <div className="field">
                    {recepcionando ? (
                      <>
                        <div className="label">Cantidad recibida (esperado {abierto.cantidad})</div>
                        <input
                          type="number"
                          className="motivo-select"
                          style={{ width: 110 }}
                          value={cantidadRecibida}
                          onChange={(e) => setCantidadRecibida(e.target.value)}
                        />
                        <div style={{ marginTop: 6 }}>
                          <button
                            className="link-btn"
                            onClick={async () => {
                              const res = await recepcionarOC(abierto.id, Number(cantidadRecibida));
                              if (!res.ok) return alert(res.error);
                              setRecepcionando(false);
                              if (res.descuadre) refrescarDescuadres();
                              setAbierto(null);
                              refrescar();
                            }}
                          >
                            Confirmar recepción
                          </button>{" "}
                          <button className="link-btn" onClick={() => setRecepcionando(false)}>Cancelar</button>
                        </div>
                      </>
                    ) : (
                      <button className="link-btn" onClick={() => setRecepcionando(true)}>📥 Recepcionar mercadería</button>
                    )}
                  </div>
                )}
              </div>
            )}

            <div style={{ marginTop: 10 }}>
              <div className="label" style={{ marginBottom: 6 }}>📋 Seguimiento</div>
              <div className="row" style={{ marginBottom: 8, alignItems: "flex-end" }}>
                <div className="field" style={{ flex: 1 }}>
                  <textarea
                    className="motivo-textarea"
                    rows={2}
                    placeholder="Agregar comentario de seguimiento…"
                    value={comentarioOC}
                    onChange={(e) => setComentarioOC(e.target.value)}
                  />
                </div>
                <button
                  className="link-btn"
                  onClick={async () => {
                    const res = await agregarComentarioOC(abierto.id, comentarioOC);
                    if (!res.ok) return alert(res.error);
                    setComentarioOC("");
                    obtenerHistorialOC(abierto.id).then(setHistorialOC);
                  }}
                >
                  Comentar
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, overflowY: "auto" }}>
                {historialOC.length === 0 && (
                  <p style={{ fontSize: 12, color: "var(--grey-text)" }}>Sin movimientos registrados todavía.</p>
                )}
                {historialOC.map((h) => (
                  <div key={h.id} style={{ fontSize: 12, borderLeft: "2px solid var(--teal)", paddingLeft: 8 }}>
                    <span style={{ color: "var(--grey-text)" }}>
                      {new Date(h.creadoEn).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })}
                    </span>{" "}
                    — {h.accion}
                  </div>
                ))}
              </div>
            </div>

            {abierto.columna === "oc_construccion" ? (
              <>
                <div className="row" style={{ marginTop: 10 }}>
                  <div className="field">
                    <div className="label">Condición de pago</div>
                    <input
                      className="motivo-select"
                      placeholder="Ej. Crédito 30 días"
                      value={condicionPago}
                      onChange={(e) => setCondicionPago(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <div className="label">Costo unitario</div>
                    <input
                      type="number"
                      className="motivo-select"
                      style={{ width: 110 }}
                      value={costoUnitario}
                      onChange={(e) => setCostoUnitario(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <div className="label">Modalidad de pago (proveedor)</div>
                    <select className="motivo-select" value={modalidadPago} onChange={(e) => setModalidadPago(e.target.value)}>
                      {MODALIDADES_PAGO_PROVEEDOR.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="field" style={{ margin: "10px 0" }}>
                  <div className="label">Nota de la OC</div>
                  <textarea className="motivo-textarea" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} />
                </div>
                {error && <div style={{ color: "var(--red)", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
                <div className="guardar-cerrar">
                  <button
                    className="btn-secundario"
                    disabled={guardando}
                    onClick={async () => {
                      setGuardando(true);
                      await guardarBorradorOC(abierto.id, {
                        condicionPago: condicionPago || null,
                        costoUnitario: costoUnitario ? Number(costoUnitario) : null,
                        nota: nota || null,
                      });
                      setGuardando(false);
                      refrescar();
                    }}
                  >
                    Guardar borrador
                  </button>
                  <button
                    disabled={guardando}
                    onClick={async () => {
                      setGuardando(true);
                      await guardarBorradorOC(abierto.id, {
                        condicionPago: condicionPago || null,
                        costoUnitario: costoUnitario ? Number(costoUnitario) : null,
                        nota: nota || null,
                      });
                      const res = await confirmarEmisionOC(abierto.id, modalidadPago);
                      setGuardando(false);
                      if (!res.ok) {
                        setError(res.error ?? "No se pudo emitir.");
                        return;
                      }
                      setAbierto(null);
                      refrescar();
                    }}
                  >
                    Emitir OC
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="row">
                  {abierto.condicionPago && (
                    <div className="field">
                      <div className="label">Condición de pago</div>
                      <div className="value">{abierto.condicionPago}</div>
                    </div>
                  )}
                  {abierto.modalidadPago && (
                    <div className="field">
                      <div className="label">Modalidad de pago</div>
                      <div className="value">{abierto.modalidadPago}</div>
                    </div>
                  )}
                  {abierto.nota && (
                    <div className="field">
                      <div className="label">Nota</div>
                      <div className="value">{abierto.nota}</div>
                    </div>
                  )}
                </div>
                {abierto.columna === "oc_pendientes" && abierto.filaPago === "pendientes_pago" && (() => {
                  const pagado = tramos.filter((t) => t.pagado).reduce((a, t) => a + t.monto, 0);
                  const saldo = abierto.monto - pagado;
                  return (
                    <div style={{ marginTop: 10 }}>
                      <div className="row" style={{ marginBottom: 10 }}>
                        <div className="field">
                          <div className="label">Total</div>
                          <div className="value">{clp(abierto.monto)}</div>
                        </div>
                        <div className="field">
                          <div className="label">Pagado</div>
                          <div className="value">{clp(pagado)}</div>
                        </div>
                        <div className="field">
                          <div className="label">Saldo</div>
                          <div className="value">{clp(saldo)}</div>
                        </div>
                      </div>
                      <div className="label" style={{ marginBottom: 6 }}>Plan de pago</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {tramos.map((t) => (
                          <div key={t.id} style={{ background: "var(--grey-tint)", borderRadius: 8, padding: 10 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ fontSize: 12.5, fontWeight: 600 }}>{t.etiqueta} — {clp(t.monto)}</span>
                              {t.pagado ? (
                                <span className="badge stock_ok">✓ Pagado · {t.medio}</span>
                              ) : tramoAbierto === t.id ? null : (
                                <button className="link-btn" onClick={() => { setTramoAbierto(t.id); setMedioPago(MEDIOS_PAGO[0]); setComprobante(""); }}>
                                  Registrar pago
                                </button>
                              )}
                            </div>
                            {!t.pagado && tramoAbierto === t.id && (
                              <div className="row" style={{ marginTop: 8, alignItems: "flex-end" }}>
                                <div className="field">
                                  <div className="label">Medio</div>
                                  <select className="motivo-select" value={medioPago} onChange={(e) => setMedioPago(e.target.value)}>
                                    {MEDIOS_PAGO.map((m) => (
                                      <option key={m} value={m}>{m}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="field">
                                  <div className="label">N° comprobante</div>
                                  <input className="motivo-select" value={comprobante} onChange={(e) => setComprobante(e.target.value)} />
                                </div>
                                <button
                                  className="link-btn"
                                  onClick={async () => {
                                    const res = await registrarPagoTramo(t.id, { medio: medioPago, comprobante });
                                    if (!res.ok) return alert(res.error);
                                    setTramoAbierto(null);
                                    obtenerTramosPago(abierto.id).then(setTramos);
                                    refrescar();
                                  }}
                                >
                                  Confirmar
                                </button>
                                <button className="link-btn" onClick={() => setTramoAbierto(null)}>Cancelar</button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      {saldo === 0 && (
                        <p style={{ fontSize: 12.5, color: "var(--teal)", fontWeight: 700, marginTop: 8 }}>
                          ✓ Saldo pagado — pasó a «Pendiente de despacho».
                        </p>
                      )}
                    </div>
                  );
                })()}

                {COLUMNAS_CON_ENVIO.includes(abierto.columna) && (() => {
                  const t = transportistas.find((x) => x.nombre === abierto.transportistaNombre);
                  const linkRastreo = t && abierto.tracking ? urlDeRastreo(t.urlRastreo, abierto.tracking) : null;
                  return (
                    <div style={{ marginTop: 10 }}>
                      <div className="label" style={{ marginBottom: 6 }}>Registrar envío</div>
                      <div className="row" style={{ alignItems: "flex-end" }}>
                        <div className="field">
                          <div className="label">Transportista</div>
                          <select className="motivo-select" value={envioTransportista} onChange={(e) => setEnvioTransportista(e.target.value)}>
                            <option value="">Elige…</option>
                            {transportistas.filter((x) => x.activo).map((x) => (
                              <option key={x.nombre} value={x.nombre}>{x.nombre} ({x.tipo})</option>
                            ))}
                          </select>
                        </div>
                        <div className="field">
                          <div className="label">N° de seguimiento</div>
                          <input className="motivo-select" value={envioTracking} onChange={(e) => setEnvioTracking(e.target.value)} />
                        </div>
                        <button
                          className="link-btn"
                          onClick={async () => {
                            const res = await registrarEnvio(abierto.id, envioTransportista, envioTracking);
                            if (!res.ok) return alert(res.error);
                            refrescar();
                          }}
                        >
                          Guardar
                        </button>
                      </div>
                      {linkRastreo && (
                        <a href={linkRastreo} target="_blank" rel="noopener noreferrer" className="link-btn" style={{ display: "inline-block", marginTop: 8 }}>
                          Rastrear en el sitio de {t!.nombre} →
                        </a>
                      )}
                    </div>
                  );
                })()}

                {abierto.modalidadPago && (
                  <div style={{ marginTop: 10 }}>
                    <div className="label" style={{ marginBottom: 6 }}>💳 Factura del proveedor (para el pago)</div>
                    <div className="row" style={{ alignItems: "flex-end" }}>
                      <div className="field">
                        <div className="label">N° de factura</div>
                        <input className="motivo-select" value={facturaNumero} onChange={(e) => setFacturaNumero(e.target.value)} />
                      </div>
                      <div className="field">
                        <div className="label">Fecha de emisión</div>
                        <input type="date" className="motivo-select" value={facturaFechaEmision} onChange={(e) => setFacturaFechaEmision(e.target.value)} />
                      </div>
                      <div className="field">
                        <div className="label">Monto de la factura</div>
                        <input
                          type="number"
                          className="motivo-select"
                          style={{ width: 120 }}
                          placeholder={String(abierto.monto)}
                          value={facturaMonto}
                          onChange={(e) => setFacturaMonto(e.target.value)}
                        />
                      </div>
                      <button
                        className="link-btn"
                        onClick={async () => {
                          const res = await registrarFacturaProveedor(abierto.id, {
                            numero: facturaNumero, fechaEmision: facturaFechaEmision, monto: Number(facturaMonto),
                          });
                          if (!res.ok) return alert(res.error);
                          obtenerCuentaPorPagar(abierto.id).then(setCuentaPorPagar);
                        }}
                      >
                        {cuentaPorPagar ? "Actualizar" : "Guardar"}
                      </button>
                    </div>
                    {cuentaPorPagar && (
                      <p style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 6 }}>
                        {cuentaPorPagar.modalidad}
                        {cuentaPorPagar.fechaVencimiento
                          ? ` — vence ${new Date(cuentaPorPagar.fechaVencimiento).toLocaleDateString("es-CL")}`
                          : " — se paga por su propio disparador (no por vencimiento)"}
                        {" "}· enviada a Gerencia Finanzas
                        {cuentaPorPagar.estado === "pagada" && " · ✓ Pagada"}
                      </p>
                    )}
                  </div>
                )}

                <div className="guardar-cerrar">
                  <button onClick={() => setAbierto(null)}>✓ Guardar y cerrar</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {panelTransportistas && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setPanelTransportistas(false)}>
          <div className="detalle">
            <button className="close-x" onClick={() => setPanelTransportistas(false)}>✕</button>
            <h2>🚚 Transportistas</h2>
            <div className="sub">Maestro propio del software — alimenta «Registrar envío».</div>

            <input
              className="motivo-select"
              placeholder="Buscar…"
              style={{ margin: "10px 0" }}
              value={tBusqueda}
              onChange={(e) => setTBusqueda(e.target.value)}
            />

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              {transportistas
                .filter((x) => x.nombre.toLowerCase().includes(tBusqueda.toLowerCase()))
                .map((x) => (
                  <div key={x.nombre} style={{ background: "var(--grey-tint)", borderRadius: 8, padding: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{x.nombre} {!x.activo && <span className="badge">Inactivo</span>}</div>
                      <div style={{ fontSize: 11.5, color: "var(--grey-text)" }}>{x.tipo}{x.urlRastreo ? ` · ${x.urlRastreo}` : ""}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        className="link-btn"
                        onClick={() => {
                          setTNombre(x.nombre);
                          setTTipo(x.tipo);
                          setTUrl(x.urlRastreo ?? "");
                        }}
                      >
                        Editar
                      </button>
                      <button
                        className="link-btn"
                        onClick={async () => {
                          await cambiarActivoTransportista(x.nombre, !x.activo);
                          refrescarTransportistas();
                        }}
                      >
                        {x.activo ? "Desactivar" : "Activar"}
                      </button>
                    </div>
                  </div>
                ))}
            </div>

            <div className="label" style={{ marginBottom: 6 }}>+ Agregar / editar</div>
            <div className="row">
              <div className="field">
                <div className="label">Nombre</div>
                <input className="motivo-select" value={tNombre} onChange={(e) => setTNombre(e.target.value)} />
              </div>
              <div className="field">
                <div className="label">Tipo</div>
                <select className="motivo-select" value={tTipo} onChange={(e) => setTTipo(e.target.value)}>
                  {TIPOS_TRANSPORTISTA.map((x) => (
                    <option key={x} value={x}>{x}</option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ flex: 1 }}>
                <div className="label">URL de rastreo (usa {"{tracking}"})</div>
                <input
                  className="motivo-select"
                  placeholder="https://…/{tracking}"
                  value={tUrl}
                  onChange={(e) => setTUrl(e.target.value)}
                />
              </div>
            </div>
            <div className="guardar-cerrar">
              <button
                onClick={async () => {
                  const res = await guardarTransportista(tNombre, { tipo: tTipo, urlRastreo: tUrl || null });
                  if (!res.ok) return alert(res.error);
                  setTNombre("");
                  setTUrl("");
                  setTTipo(TIPOS_TRANSPORTISTA[0]);
                  refrescarTransportistas();
                }}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {panelProveedores && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setPanelProveedores(false)}>
          <div className="detalle">
            <button className="close-x" onClick={() => setPanelProveedores(false)}>✕</button>
            <h2>🏭 Proveedores</h2>
            <div className="sub">Condición de pago + ruta — la ruta define qué columnas de Compras aplican.</div>

            <input
              className="motivo-select"
              placeholder="Buscar…"
              style={{ margin: "10px 0" }}
              value={pBusqueda}
              onChange={(e) => setPBusqueda(e.target.value)}
            />

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              {proveedores
                .filter((x) => x.nombre.toLowerCase().includes(pBusqueda.toLowerCase()))
                .map((x) => (
                  <div key={x.nombre} style={{ background: "var(--grey-tint)", borderRadius: 8, padding: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{x.nombre}</div>
                      <div style={{ fontSize: 11.5, color: "var(--grey-text)" }}>
                        {x.ruta}{x.condicionPago ? ` · ${x.condicionPago}` : ""}
                      </div>
                    </div>
                    <button
                      className="link-btn"
                      onClick={() => {
                        setPNombre(x.nombre);
                        setPCondicionPago(x.condicionPago ?? "");
                        setPRuta(x.ruta);
                      }}
                    >
                      Editar
                    </button>
                  </div>
                ))}
              {proveedores.length === 0 && (
                <p style={{ fontSize: 12, color: "var(--grey-text)" }}>
                  Sin proveedores registrados todavía — los que no estén acá no tienen restricción de ruta.
                </p>
              )}
            </div>

            <div className="label" style={{ marginBottom: 6 }}>+ Agregar / editar</div>
            <div className="row">
              <div className="field">
                <div className="label">Nombre (igual al de las OC)</div>
                <input className="motivo-select" value={pNombre} onChange={(e) => setPNombre(e.target.value)} />
              </div>
              <div className="field">
                <div className="label">Ruta</div>
                <select className="motivo-select" value={pRuta} onChange={(e) => setPRuta(e.target.value)}>
                  {RUTAS_PROVEEDOR.map((x) => (
                    <option key={x} value={x}>{x}</option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ flex: 1 }}>
                <div className="label">Condición de pago</div>
                <input
                  className="motivo-select"
                  placeholder="Ej. Crédito 30 días"
                  value={pCondicionPago}
                  onChange={(e) => setPCondicionPago(e.target.value)}
                />
              </div>
            </div>
            <div className="guardar-cerrar">
              <button
                onClick={async () => {
                  const res = await guardarProveedor(pNombre, { condicionPago: pCondicionPago || null, ruta: pRuta });
                  if (!res.ok) return alert(res.error);
                  setPNombre("");
                  setPCondicionPago("");
                  setPRuta(RUTAS_PROVEEDOR[2]);
                  refrescarProveedores();
                }}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {panelEmbarques && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setPanelEmbarques(false)}>
          <div className="detalle">
            <button className="close-x" onClick={() => setPanelEmbarques(false)}>✕</button>
            <h2>📦 Consolidado de Miami</h2>
            <div className="sub">Carga (embarque) = unidad de seguimiento que agrupa varias OC — avanzan juntas.</div>

            <div className="label" style={{ margin: "12px 0 6px" }}>Embarques en curso</div>
            {cargas.length === 0 && <p style={{ fontSize: 12, color: "var(--grey-text)" }}>Sin embarques todavía.</p>}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {cargas.map((c) => (
                <div key={c.id} style={{ background: "var(--grey-tint)", borderRadius: 8, padding: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{c.id} — {NOMBRES_COLUMNAS_EMBARQUE[c.columna]}</span>
                    {c.columna !== "cargas_recibidas" ? (
                      <button
                        className="link-btn"
                        onClick={async () => {
                          await avanzarCarga(c.id);
                          refrescarEmbarques();
                          refrescar();
                        }}
                      >
                        Avanzar a «{NOMBRES_COLUMNAS_EMBARQUE[COLUMNAS_EMBARQUE[COLUMNAS_EMBARQUE.indexOf(c.columna) + 1]]}»
                      </button>
                    ) : (
                      <span className="badge stock_ok">✓ Cerrado</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--grey-text)", marginTop: 4 }}>
                    {c.warehouseReceipt && `WR: ${c.warehouseReceipt} · `}
                    {c.awb && `AWB: ${c.awb} · `}
                    {c.ordenes.length} OC — {c.ordenes.map((o) => o.id).join(", ")}
                  </div>
                </div>
              ))}
            </div>

            <div className="label" style={{ marginBottom: 6 }}>Armar nuevo embarque</div>
            <p style={{ fontSize: 11.5, color: "var(--grey-text)", marginTop: 0 }}>
              OC en «Pendiente de despacho» disponibles para embarcar:
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
              {ocsParaEmbarcar.length === 0 && (
                <p style={{ fontSize: 12, color: "var(--grey-text)" }}>No hay OC pendientes de despacho sin embarcar.</p>
              )}
              {ocsParaEmbarcar.map((o) => (
                <label key={o.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                  <input
                    type="checkbox"
                    checked={seleccionEmbarque.includes(o.id)}
                    onChange={(e) =>
                      setSeleccionEmbarque((sel) =>
                        e.target.checked ? [...sel, o.id] : sel.filter((x) => x !== o.id)
                      )
                    }
                  />
                  {o.id} — {o.proveedor} — {o.producto} — {clp(o.monto)}
                </label>
              ))}
            </div>
            <div className="row">
              <div className="field">
                <div className="label">Warehouse Receipt</div>
                <input className="motivo-select" value={embWarehouseReceipt} onChange={(e) => setEmbWarehouseReceipt(e.target.value)} />
              </div>
              <div className="field">
                <div className="label">N° guía aérea (AWB)</div>
                <input className="motivo-select" value={embAwb} onChange={(e) => setEmbAwb(e.target.value)} />
              </div>
            </div>
            <div className="guardar-cerrar">
              <button
                disabled={seleccionEmbarque.length === 0}
                onClick={async () => {
                  const res = await crearEmbarque(seleccionEmbarque, {
                    warehouseReceipt: embWarehouseReceipt || null,
                    awb: embAwb || null,
                  });
                  if (!res.ok) return alert(res.error);
                  refrescarEmbarques();
                  refrescar();
                }}
              >
                Crear embarque
              </button>
            </div>
          </div>
        </div>
      )}

      {panelStock && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setPanelStock(false)}>
          <div className="detalle">
            <button className="close-x" onClick={() => setPanelStock(false)}>✕</button>
            <h2>📊 Política de stock</h2>
            <div className="sub">Con mínimo cargado = «de stock» (se repone solo); sin mínimo = «a pedido».</div>

            <div className="label" style={{ margin: "12px 0 6px" }}>⚠️ Alertas de reposición</div>
            {alertasReposicion.length === 0 && (
              <p style={{ fontSize: 12, color: "var(--grey-text)" }}>Sin alertas — todo sobre su mínimo (disponible + tránsito).</p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {alertasReposicion.map((a) => (
                <div key={a.sku} style={{ background: "var(--red-tint, #fde8e8)", borderRadius: 8, padding: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 12.5 }}>
                    <div style={{ fontWeight: 600 }}>{a.nombre} ({a.sku})</div>
                    <div style={{ color: "var(--grey-text)", fontSize: 11.5 }}>
                      Disponible {a.stockActual} + tránsito {a.transito} · mínimo {a.minimo} — faltan {a.faltante}
                    </div>
                  </div>
                  <button
                    className="link-btn"
                    onClick={async () => {
                      const res = await generarOCReposicion(a.sku);
                      if (!res.ok) return alert(res.error);
                      refrescarStock();
                      refrescar();
                    }}
                  >
                    Generar OC
                  </button>
                </div>
              ))}
            </div>

            <div className="label" style={{ marginBottom: 6 }}>Maestro de productos</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14, maxHeight: 180, overflowY: "auto" }}>
              {productosMaestro.map((p) => (
                <div key={p.sku} style={{ background: "var(--grey-tint)", borderRadius: 8, padding: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 12.5 }}>
                    <div style={{ fontWeight: 600 }}>
                      {p.nombre} ({p.sku}) <span className="badge">{p.minimo != null ? "De stock" : "A pedido"}</span>
                    </div>
                    <div style={{ color: "var(--grey-text)", fontSize: 11.5 }}>
                      {p.proveedor ?? "Sin proveedor"} · disponible {p.stockActual}
                      {p.minimo != null && ` · mín ${p.minimo}`}
                      {p.maximo != null && ` · máx ${p.maximo}`}
                    </div>
                  </div>
                  <button
                    className="link-btn"
                    onClick={() => {
                      setMsSku(p.sku);
                      setMsNombre(p.nombre);
                      setMsProveedor(p.proveedor ?? "");
                      setMsStockActual(String(p.stockActual));
                      setMsMinimo(p.minimo != null ? String(p.minimo) : "");
                      setMsMaximo(p.maximo != null ? String(p.maximo) : "");
                    }}
                  >
                    Editar
                  </button>
                </div>
              ))}
              {productosMaestro.length === 0 && (
                <p style={{ fontSize: 12, color: "var(--grey-text)" }}>Sin productos cargados todavía.</p>
              )}
            </div>

            <div className="label" style={{ marginBottom: 6 }}>+ Agregar / editar</div>
            <div className="row">
              <div className="field">
                <div className="label">SKU</div>
                <input className="motivo-select" value={msSku} onChange={(e) => setMsSku(e.target.value)} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <div className="label">Nombre</div>
                <input className="motivo-select" value={msNombre} onChange={(e) => setMsNombre(e.target.value)} />
              </div>
              <div className="field">
                <div className="label">Proveedor</div>
                <input className="motivo-select" value={msProveedor} onChange={(e) => setMsProveedor(e.target.value)} />
              </div>
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <div className="field">
                <div className="label">Disponible (simulado)</div>
                <input type="number" className="motivo-select" style={{ width: 110 }} value={msStockActual} onChange={(e) => setMsStockActual(e.target.value)} />
              </div>
              <div className="field">
                <div className="label">Mínimo</div>
                <input type="number" className="motivo-select" style={{ width: 90 }} placeholder="—" value={msMinimo} onChange={(e) => setMsMinimo(e.target.value)} />
              </div>
              <div className="field">
                <div className="label">Máximo</div>
                <input type="number" className="motivo-select" style={{ width: 90 }} placeholder="—" value={msMaximo} onChange={(e) => setMsMaximo(e.target.value)} />
              </div>
            </div>
            <div className="guardar-cerrar">
              <button
                onClick={async () => {
                  const res = await guardarProductoMaestro(msSku, {
                    nombre: msNombre,
                    proveedor: msProveedor || null,
                    stockActual: Number(msStockActual) || 0,
                    minimo: msMinimo ? Number(msMinimo) : null,
                    maximo: msMaximo ? Number(msMaximo) : null,
                  });
                  if (!res.ok) return alert(res.error);
                  setMsSku("");
                  setMsNombre("");
                  setMsProveedor("");
                  setMsStockActual("0");
                  setMsMinimo("");
                  setMsMaximo("");
                  refrescarStock();
                }}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {panelDescuadres && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setPanelDescuadres(false)}>
          <div className="detalle">
            <button className="close-x" onClick={() => setPanelDescuadres(false)}>✕</button>
            <h2>🔀 Descuadres de recepción</h2>
            <div className="sub">
              ＋ Sobró (azul) = llegó de más · − Faltó / ⊘ No llegó (rojo) = no calza con lo esperado.
            </div>

            <div className="row" style={{ margin: "10px 0" }}>
              <span className="badge" style={{ background: "#dbeafe", color: "#2563eb" }}>
                ＋ Sobró: {descuadres.filter((d) => d.tipo === "sobro").length}
              </span>
              <span className="badge" style={{ background: "#fee2e2", color: "#dc2626" }}>
                − Faltó: {descuadres.filter((d) => d.tipo === "falto").length}
              </span>
              <span className="badge" style={{ background: "#fee2e2", color: "#dc2626" }}>
                ⊘ No llegó: {descuadres.filter((d) => d.tipo === "no_llego").length}
              </span>
            </div>

            {descuadres.length === 0 && <p style={{ fontSize: 12, color: "var(--grey-text)" }}>Sin descuadres abiertos.</p>}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {descuadres.map((d) => {
                const chip = CHIP_DESCUADRE[d.tipo];
                return (
                  <div key={d.id} style={{ background: "var(--grey-tint)", borderRadius: 8, padding: 10, borderLeft: `4px solid ${chip.color}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ fontSize: 12.5 }}>
                        <div style={{ fontWeight: 600 }}>
                          {d.producto} <span style={{ color: chip.color }}>{chip.texto}</span>
                        </div>
                        <div style={{ color: "var(--grey-text)", fontSize: 11.5 }}>
                          {d.ordenCompraId} · {d.proveedor} — esperado {d.cantidadEsperada}, recibido {d.cantidadRecibida} ({d.diferencia > 0 ? "+" : ""}{d.diferencia})
                        </div>
                        {d.origenPedido && (
                          <div style={{ color: "var(--grey-text)", fontSize: 11 }}>Origen: {d.origenPedido}</div>
                        )}
                      </div>
                    </div>
                    <div style={{ marginTop: 8, display: "flex", gap: 10 }}>
                      {d.tipo === "sobro" ? (
                        <button
                          className="link-btn"
                          onClick={async () => {
                            await cerrarDescuadre(d.id, "ingresar_stock");
                            refrescarDescuadres();
                          }}
                        >
                          Ingresar a stock
                        </button>
                      ) : (
                        <button
                          className="link-btn"
                          onClick={async () => {
                            await cerrarDescuadre(d.id, "generar_oc");
                            refrescarDescuadres();
                            refrescar();
                          }}
                        >
                          Generar OC por el faltante
                        </button>
                      )}
                      <button
                        className="link-btn"
                        onClick={async () => {
                          await cerrarDescuadre(d.id, "descartar");
                          refrescarDescuadres();
                        }}
                      >
                        Descartar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {posponiendoCompra && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setPosponiendoCompra(null)}>
          <div className="detalle">
            <button className="close-x" onClick={() => setPosponiendoCompra(null)}>✕</button>
            <h2>⏸ Posponer compra</h2>
            <div className="sub">{posponiendoCompra}</div>
            <p style={{ fontSize: 11.5, color: "var(--ink-soft)", margin: "8px 0" }}>
              No bloquea nada — las líneas se siguen acumulando en «Por pedir»; el grupo solo queda marcado para que
              se sepa por qué todavía no se emite la OC.
            </p>

            <div className="field" style={{ marginBottom: 10 }}>
              <div className="label">Motivo</div>
              <select className="motivo-select" value={pcMotivo} onChange={(e) => setPcMotivo(e.target.value)}>
                {MOTIVOS_POSPONER_COMPRA.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 10 }}>
              <div className="label">Fecha para volver a evaluar (opcional)</div>
              <input type="date" className="motivo-select" value={pcFecha} onChange={(e) => setPcFecha(e.target.value)} />
            </div>
            <div className="field" style={{ marginBottom: 14 }}>
              <div className="label">Nota libre (opcional)</div>
              <textarea className="motivo-textarea" rows={2} value={pcNota} onChange={(e) => setPcNota(e.target.value)} />
            </div>

            <div className="guardar-cerrar">
              {posposicionesCompra.some((x) => x.proveedor === posponiendoCompra) && (
                <button
                  className="btn-secundario"
                  onClick={async () => {
                    await quitarPosposicionCompra(posponiendoCompra);
                    refrescarPosposicionesCompra();
                    setPosponiendoCompra(null);
                  }}
                >
                  Quitar espera
                </button>
              )}
              <button
                onClick={async () => {
                  const res = await posponerCompraProveedor(posponiendoCompra, { motivo: pcMotivo, fechaReevaluar: pcFecha || null, nota: pcNota });
                  if (!res.ok) return alert(res.error);
                  refrescarPosposicionesCompra();
                  setPosponiendoCompra(null);
                }}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
