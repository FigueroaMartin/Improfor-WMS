"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { VISTA_DEFAULT } from "./VistaTabs";
import { COLUMNAS_DESPACHO, MOTIVOS_CANCELACION, MOTIVOS_MOVER_PRODUCTO, TIPOS_DOCUMENTO, MODOS_DESPACHO, type PedidoConProductos } from "@/lib/dominio";
import {
  moverPedido,
  eliminarPedido,
  actualizarSituacionCobro,
  actualizarFacturaAnticipada,
  actualizarDocumento,
  agregarAdjunto,
  eliminarAdjunto,
  obtenerHistorialDespacho,
  clasificarIngreso,
  deshacerAccionDespacho,
  crearCacho,
  comentarCacho,
  resolverCacho,
  reabrirCacho,
  eliminarCacho,
  marcarEntregado,
  avisarVendedorGenerico,
  confirmarTransformacion,
  moverProductoEntrePedidos,
  solicitarAbono,
} from "./actions";
import { obtenerPreferenciasDespacho } from "@/app/clientes/actions";
import type { HistorialAccion, Cacho, CachoComentario } from "@prisma/client";

type CachoConComentarios = Cacho & { comentarios: CachoComentario[] };

type Adjunto = { nombre: string; dataUrl: string; subidoEn: string };

// Opciones acotadas a propósito (pedido de Luisana) — "Pendiente de pago"
// se sigue alcanzando solo, vía el abono en 2 pasos (solicitarAbono);
// "Pendiente" y "Cachos" quedan como columnas del tablero pero ya no como
// destino manual de clasificación, para reducir el margen de error.
const DESTINOS_INGRESO = [
  { id: "por_pedir", nombre: "Por pedir" },
  { id: "salida_bodega", nombre: "Salida de bodega" },
  { id: "despacho", nombre: "Despacho" },
];

function fechaCorta(iso: string | Date) {
  return new Date(iso).toLocaleString("es-CL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function badgeStock(estado: string) {
  if (estado === "falta") return <span className="badge stock_falta">Falta stock</span>;
  if (estado === "bloqueado") return <span className="badge stock_bloqueado">Bloqueado</span>;
  return <span className="badge stock_ok">Stock OK</span>;
}

function badgeCobro(situacion: string | null) {
  if (!situacion) return null;
  if (situacion === "Pendiente de pago") return <span className="badge pendiente_pago">Pendiente de pago</span>;
  return <span className="badge ok">{situacion}</span>;
}

export default function Board({
  pedidos,
  cachos,
  autor,
}: {
  pedidos: PedidoConProductos[];
  cachos: CachoConComentarios[];
  autor?: string;
}) {
  const router = useRouter();
  const vista = useSearchParams().get("vista") || VISTA_DEFAULT;
  // Buscador de la vista "Pedidos despachados" — filtra por ID o cliente,
  // pero las 3 columnas (Listo para retiro / En tránsito / Entregado) se
  // mantienen siempre a la vista, cada una mostrando solo sus coincidencias.
  const [filtroDespachados, setFiltroDespachados] = useState("");
  const [nuevoCacho, setNuevoCacho] = useState("");
  const [comentarios, setComentarios] = useState<Record<number, string>>({});
  const [, startTransition] = useTransition();
  const [abierto, setAbierto] = useState<PedidoConProductos | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [historial, setHistorial] = useState<HistorialAccion[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Arrancan en blanco a propósito — nada preseleccionado por defecto, para
  // obligar a elegir explícitamente y evitar errores por dejar pasar el
  // valor que haya quedado marcado.
  const [claDocumento, setClaDocumento] = useState<string>("");
  const [claModo, setClaModo] = useState("");
  const [claDestino, setClaDestino] = useState("");
  const [claOtSendu, setClaOtSendu] = useState("");
  const [claSituacionCobro, setClaSituacionCobro] = useState<string>("");
  const [claFacturaAnticipada, setClaFacturaAnticipada] = useState(false);
  const [claError, setClaError] = useState<string | null>(null);
  const [pedidoCachoPendiente, setPedidoCachoPendiente] = useState<string | null>(null);
  const [textoCachoPendiente, setTextoCachoPendiente] = useState("");
  const [cachosDragOver, setCachosDragOver] = useState(false);
  // Toggle para esconder "Cachos" mientras no se decide si se mantiene en
  // el tablero — es solo preferencia visual de quien mira, no se guarda en
  // el servidor (si cambia de equipo vuelve a verla).
  const [mostrarCachos, setMostrarCachos] = useState(true);
  useEffect(() => {
    const guardado = localStorage.getItem("despacho_mostrar_cachos");
    if (guardado != null) setMostrarCachos(guardado === "1");
  }, []);
  function toggleCachos() {
    setMostrarCachos((v) => {
      const next = !v;
      localStorage.setItem("despacho_mostrar_cachos", next ? "1" : "0");
      return next;
    });
  }
  type ComponenteTransform = { sku: string; nombre: string; necesario: number; stockDisponible: number; alcanza: boolean };
  type ProductoTransform = { id: number; nombre: string; cantidad: number; componentes: ComponenteTransform[] };
  const [transformacion, setTransformacion] = useState<{ pedidoId: string; productos: ProductoTransform[]; error?: string } | null>(null);
  const [moverProducto, setMoverProducto] = useState<{ productoId: number; cantidad: number; destino: string; motivo: string; error?: string } | null>(null);
  const [abonoPendiente, setAbonoPendiente] = useState<{ pedidoId: string; monto: string; nota: string; error?: string } | null>(null);

  // Acciones pendientes de confirmar: en vez de un toast que se cierra solo
  // a los 8s, quedan aquí (persistentes) hasta que Luisana apriete
  // "✓ Confirmar acciones" — hasta entonces puede deshacer cualquiera.
  const [pendientes, setPendientes] = useState<{ id: number; historialId: number; mensaje: string }[]>([]);

  function mostrarToast(mensaje: string, historialId?: number) {
    if (historialId == null) return;
    setPendientes((prev) => [...prev, { id: historialId, historialId, mensaje }]);
  }

  async function deshacer(historialId: number) {
    setPendientes((prev) => prev.filter((p) => p.historialId !== historialId));
    const res = await deshacerAccionDespacho(historialId);
    if (!res.ok) alert(res.error);
    refrescar();
  }

  function confirmarAcciones() {
    setPendientes([]);
  }

  // Intenta mover un pedido; si requiere confirmar una transformación de
  // productos primero, abre el pop-up en vez de mover.
  function intentarMover(id: string, columnaDestino: string, nombreCol: string) {
    moverPedido(id, columnaDestino).then((res: any) => {
      if (res.ok) {
        mostrarToast(`${id}: movido a «${nombreCol}»`, res.historialId);
        refrescar();
        return;
      }
      if (res.requiereTransformacion) {
        setTransformacion({ pedidoId: id, productos: res.productos });
        return;
      }
      if (res.requiereAbono) {
        setAbonoPendiente({ pedidoId: id, monto: "", nota: "" });
        return;
      }
      alert(res.error);
      refrescar();
    });
  }

  function confirmarTransformacionPendiente() {
    if (!transformacion) return;
    confirmarTransformacion(transformacion.pedidoId).then((res) => {
      if (!res.ok) {
        setTransformacion((t) => (t ? { ...t, error: res.error } : t));
        return;
      }
      const id = transformacion.pedidoId;
      setTransformacion(null);
      intentarMover(id, "despacho", "Despacho");
    });
  }

  function confirmarAbonoPendiente() {
    if (!abonoPendiente) return;
    const monto = Number(abonoPendiente.monto);
    if (!monto || monto < 1) {
      setAbonoPendiente((a) => (a ? { ...a, error: "Ingresa un monto válido." } : a));
      return;
    }
    solicitarAbono(abonoPendiente.pedidoId, monto, abonoPendiente.nota || undefined).then((res) => {
      if (!res.ok) {
        setAbonoPendiente((a) => (a ? { ...a, error: res.error } : a));
        return;
      }
      mostrarToast(`${abonoPendiente.pedidoId}: abono solicitado`, res.historialId);
      setAbonoPendiente(null);
      refrescar();
    });
  }

  useEffect(() => {
    if (!abierto) return;
    obtenerHistorialDespacho(abierto.id).then(setHistorial);
  }, [abierto?.id]);

  // Cuando refrescar() trae pedidos nuevos del servidor, sincroniza la
  // tarjeta abierta (si sigue abierta) con los datos frescos.
  useEffect(() => {
    if (!abierto) return;
    const fresco = pedidos.find((p) => p.id === abierto.id);
    if (fresco && fresco !== abierto) setAbierto(fresco);
  }, [pedidos]);

  function abrirConHistorial(p: PedidoConProductos) {
    setHistorial([]);
    setAbierto(p);
    // En blanco por defecto — salvo que el Maestro de Clientes tenga una
    // preferencia guardada para este cliente, en cuyo caso se pre-selecciona
    // sola (sigue siendo editable, no obliga a nada).
    setClaDocumento("");
    setClaModo("");
    setClaDestino("");
    if (p.columnaDespacho === "ingreso") {
      obtenerPreferenciasDespacho(p.cliente).then(({ documentoPreferido, modoDespachoPreferido }) => {
        if (documentoPreferido) setClaDocumento(documentoPreferido);
        if (modoDespachoPreferido) setClaModo(modoDespachoPreferido);
      });
    }
    setClaOtSendu(p.numeroGuiaStarken ?? "");
    setClaSituacionCobro(p.situacionCobro ?? "");
    setClaFacturaAnticipada(p.facturaAnticipada);
    setClaError(null);
    setMoverProducto(null);
  }

  function confirmarClasificacion() {
    if (!abierto) return;
    setClaError(null);
    clasificarIngreso(abierto.id, {
      documento: claDocumento,
      modoDespacho: claModo,
      columnaDestino: claDestino,
      otSendu: claOtSendu,
      situacionCobro: claSituacionCobro || null,
      facturaAnticipada: claFacturaAnticipada,
    }).then(
      (res) => {
        if (!res.ok) {
          setClaError(res.error ?? "No se pudo clasificar.");
          return;
        }
        setAbierto(null);
        mostrarToast(`${abierto.id}: ingreso clasificado`, res.historialId);
        if (claDestino === "cachos") {
          setPedidoCachoPendiente(abierto.id);
          setTextoCachoPendiente("");
        }
        refrescar();
      }
    );
  }

  function onArchivoAdjunto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !abierto) return;
    setSubiendo(true);
    const reader = new FileReader();
    reader.onload = () => {
      agregarAdjunto(abierto.id, file.name, reader.result as string).then((res) => {
        setSubiendo(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        obtenerHistorialDespacho(abierto.id).then(setHistorial);
        mostrarToast(`${abierto.id}: adjunto agregado`, res.historialId);
        refrescar();
      });
    };
    reader.readAsDataURL(file);
  }
  // Ref, no state: dragstart/dragover/drop pueden dispararse en la misma
  // pasada síncrona, antes de que React re-renderice con un dragId de
  // useState — leerlo de vuelta en onDrop daba el valor viejo (null).
  const dragIdRef = useRef<string | null>(null);
  // Solo visuales (recuadro punteado de destino + opacidad de la tarjeta
  // arrastrada) — no intervienen en la mutación, así que useState acá no
  // tiene el problema de carrera de arriba.
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  function refrescar() {
    startTransition(() => router.refresh());
  }

  function onDropCacho() {
    setCachosDragOver(false);
    const id = dragIdRef.current;
    dragIdRef.current = null;
    setDragId(null);
    if (!id) return;
    // "Cachos" es otro estado del pedido, igual que las demás columnas —
    // se arrastra y se queda ahí hasta que se saque a mano.
    moverPedido(id, "cachos").then((res) => {
      if (res.ok) mostrarToast(`${id}: movido a «Cachos»`, res.historialId);
      refrescar();
    });
    setPedidoCachoPendiente(id);
    setTextoCachoPendiente("");
  }

  function confirmarCachoPendiente() {
    if (!pedidoCachoPendiente || !textoCachoPendiente.trim()) return;
    const existente = cachos.find((c) => c.pedidoId === pedidoCachoPendiente && !c.resuelto);
    const accion = existente
      ? comentarCacho(existente.id, textoCachoPendiente, autor)
      : crearCacho(textoCachoPendiente, autor, pedidoCachoPendiente);
    accion.then(() => {
      setPedidoCachoPendiente(null);
      setTextoCachoPendiente("");
      refrescar();
    });
  }

  function onDrop(columnaId: string) {
    setDragOverCol(null);
    setDragId(null);
    const id = dragIdRef.current;
    dragIdRef.current = null;
    if (!id || columnaId === "ingreso") return; // a Ingreso no se arrastra, se clasifica
    if (["listo_retiro", "en_transito", "entregado"].includes(columnaId)) {
      alert("Esta columna la mueve Bodega (o la API del transportista) — no se arrastra a mano.");
      return;
    }
    const nombreCol = COLUMNAS_DESPACHO.find((c) => c.id === columnaId)?.nombre ?? columnaId;
    intentarMover(id, columnaId, nombreCol);
  }

  function renderCard(p: PedidoConProductos) {
    const anyFalta = p.productos.find((pr) => pr.estado !== "ok");
    return (
      <div
        key={p.id}
        className={"pedido-card" + (p.nuevo ? " nuevo" : "") + (dragId === p.id ? " dragging" : "")}
        draggable={!["ingreso", "listo_retiro", "en_transito", "entregado"].includes(p.columnaDespacho)}
        onDragStart={() => { dragIdRef.current = p.id; setDragId(p.id); }}
        onDragEnd={() => setDragId(null)}
        onClick={() => abrirConHistorial(p)}
      >
        {p.nuevo && <span className="nuevo-marker">＊</span>}
        <div className="id">
          {p.id}
          {p.oc ? ` · ${p.oc}` : ""}
        </div>
        <div className="cliente">{p.cliente}</div>
        <div className="meta">
          {badgeCobro(p.situacionCobro)}
          {p.facturaAnticipada && <span className="badge factura_anticipada">Fact. anticipada</span>}
          {anyFalta && badgeStock(anyFalta.estado)}
        </div>
      </div>
    );
  }

  const pedidosEnCachos = pedidos.filter((p) => p.columnaDespacho === "cachos");

  function zonaArrastrable(columnaId: string, children: React.ReactNode) {
    return (
      <div
        className={"drop-zone" + (dragOverCol === columnaId ? " drop-target" : "")}
        onDragOver={(e) => {
          e.preventDefault();
          if (dragOverCol !== columnaId) setDragOverCol(columnaId);
        }}
        onDragLeave={() => setDragOverCol((c) => (c === columnaId ? null : c))}
        onDrop={() => onDrop(columnaId)}
      >
        {children}
      </div>
    );
  }

  const columnasVista =
    vista === "despachados"
      ? ["listo_retiro", "en_transito", "entregado"]
      : ["despacho"];

  const textoBusqueda = filtroDespachados.trim().toLowerCase();

  return (
    <>
      {vista === "despachados" && (
        <div className="despachados-filtros" style={{ padding: "14px 22px 0" }}>
          <input
            className="motivo-select"
            style={{ maxWidth: 280 }}
            placeholder="Buscar por N° de pedido o cliente…"
            value={filtroDespachados}
            onChange={(e) => setFiltroDespachados(e.target.value)}
          />
        </div>
      )}
      <main className="board">
        {/* Ingreso y "Por pedir / Salida de bodega" solo viven en la vista
            "Ingreso de pedidos" — en "Pedidos despachados" no aplican. */}
        {vista !== "despachados" && (() => {
          const col = COLUMNAS_DESPACHO.find((c) => c.id === "ingreso")!;
          const items = pedidos.filter((p) => p.columnaDespacho === "ingreso");
          return (
            <div
              key={col.id}
              className={"column column-fluida" + (dragOverCol === col.id ? " drop-target" : "")}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragOverCol !== col.id) setDragOverCol(col.id);
              }}
              onDragLeave={() => setDragOverCol((c) => (c === col.id ? null : c))}
              onDrop={() => onDrop(col.id)}
            >
              <div className="column-head">
                <span className="name">{col.nombre}</span>
                <span className="count">{items.length}</span>
              </div>
              <div className="cards cards-grid">{items.map(renderCard)}</div>
            </div>
          );
        })()}

        {/* "Por pedir" y "Salida de bodega" van fusionadas en una sola
            columna visual (siguen siendo destinos distintos por debajo —
            Por pedir dispara la cascada de Compras, Salida de bodega la
            monitorea Bodega — cada fila es su propia zona de arrastre). */}
        {vista !== "despachados" && (() => {
          const porPedir = pedidos.filter((p) => p.columnaDespacho === "por_pedir");
          const salidaBodega = pedidos.filter((p) => p.columnaDespacho === "salida_bodega");
          return (
            <div className="column column-fluida">
              <div className="column-head">
                <span className="name">Por pedir / Salida de bodega</span>
                <span className="count">{porPedir.length + salidaBodega.length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-soft)", textTransform: "uppercase", marginBottom: 6 }}>
                    ① Por pedir ({porPedir.length})
                  </div>
                  {zonaArrastrable("por_pedir", <div className="cards cards-grid">{porPedir.map(renderCard)}</div>)}
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-soft)", textTransform: "uppercase", marginBottom: 6 }}>
                    ② Salida de bodega ({salidaBodega.length})
                  </div>
                  {zonaArrastrable("salida_bodega", <div className="cards cards-grid">{salidaBodega.map(renderCard)}</div>)}
                </div>
              </div>
            </div>
          );
        })()}

        {COLUMNAS_DESPACHO.filter((col) => columnasVista.includes(col.id)).map((col) => {
          let items = pedidos.filter((p) => p.columnaDespacho === col.id);
          if (vista === "despachados" && textoBusqueda) {
            items = items.filter(
              (p) => p.id.toLowerCase().includes(textoBusqueda) || p.cliente.toLowerCase().includes(textoBusqueda)
            );
          }
          const esDespacho = col.id === "despacho";
          return (
            <div
              key={col.id}
              className={"column " + (esDespacho ? "column-fluida-grande" : "column-fluida") + (dragOverCol === col.id ? " drop-target" : "")}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragOverCol !== col.id) setDragOverCol(col.id);
              }}
              onDragLeave={() => setDragOverCol((c) => (c === col.id ? null : c))}
              onDrop={() => onDrop(col.id)}
            >
              <div className="column-head">
                <span className="name">{col.nombre}</span>
                <span className="count">{items.length}</span>
              </div>
              <div className="cards cards-grid">{items.map(renderCard)}</div>
            </div>
          );
        })}
      </main>

      {vista !== "despachados" && (
      <section
        className={"column column-cachos" + (cachosDragOver ? " drop-target" : "")}
        onDragOver={(e) => {
          e.preventDefault();
          if (!cachosDragOver) setCachosDragOver(true);
        }}
        onDragLeave={() => setCachosDragOver(false)}
        onDrop={mostrarCachos ? onDropCacho : undefined}
      >
        <div className="column-head">
          <span className="name">🗯 Cachos</span>
          <span className="count">{pedidosEnCachos.length}</span>
          <button type="button" className="link-btn" style={{ marginLeft: "auto" }} onClick={toggleCachos}>
            {mostrarCachos ? "Ocultar ▴" : "Mostrar ▾"}
          </button>
        </div>
        {mostrarCachos && (
        <>
        <div className="cards cards-horizontal">
          {pedidosEnCachos.length === 0 && (
            <div style={{ fontSize: 12.5, color: "var(--ink-soft)", padding: "4px 2px" }}>
              Arrastra un pedido acá para dejarlo en espera con un comentario.
            </div>
          )}
          {pedidosEnCachos.map((p) => {
            const cacho = cachos.find((c) => c.pedidoId === p.id);
            const abriendoComentario = pedidoCachoPendiente === p.id;
            return (
              <div key={p.id} className="cacho-item">
                {renderCard(p)}
                {!abriendoComentario ? (
                  <div
                    className="cacho-chip"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPedidoCachoPendiente(p.id);
                      setTextoCachoPendiente("");
                    }}
                  >
                    {cacho ? cacho.comentarios[cacho.comentarios.length - 1]?.texto ?? cacho.texto : "+ agregar comentario"}
                  </div>
                ) : (
                  <div className="cacho-chip-form" onClick={(e) => e.stopPropagation()}>
                    <textarea
                      className="motivo-textarea"
                      rows={2}
                      autoFocus
                      placeholder="¿Qué pasó con este pedido?"
                      value={textoCachoPendiente}
                      onChange={(e) => setTextoCachoPendiente(e.target.value)}
                    />
                    <div className="cacho-acciones">
                      <button className="link-btn" onClick={confirmarCachoPendiente}>
                        Guardar
                      </button>
                      <button className="link-btn" onClick={() => setPedidoCachoPendiente(null)}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <form
          className="cachos-nuevo"
          style={{ marginTop: 14 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!nuevoCacho.trim()) return;
            crearCacho(nuevoCacho, autor).then(() => {
              setNuevoCacho("");
              refrescar();
            });
          }}
        >
          <textarea
            className="motivo-textarea"
            placeholder="Deja un cacho suelto (sin pedido) — un problema o algo raro que hay que conversar…"
            value={nuevoCacho}
            onChange={(e) => setNuevoCacho(e.target.value)}
            rows={2}
          />
          <button type="submit" className="btn-cacho-nuevo">
            + Agregar cacho
          </button>
        </form>
        </>
        )}

        {cachos.filter((c) => !c.pedidoId).length > 0 && (
          <div className="cachos-lista" style={{ marginTop: 10 }}>
            {cachos
              .filter((c) => !c.pedidoId)
              .map((c) => (
                <div key={c.id} className="cacho-card">
                  <div className="cacho-texto">{c.texto}</div>
                  <div className="cacho-meta">
                    {c.autor ? `${c.autor} — ` : ""}
                    {fechaCorta(c.creadoEn)}
                  </div>
                  <div className="cacho-acciones">
                    <button className="link-btn" style={{ color: "var(--red)" }} onClick={() => eliminarCacho(c.id).then(refrescar)}>
                      Eliminar
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </section>
      )}

      {abierto && !eliminando && (
        <div className="overlay open" onClick={(e) => e.target === e.currentTarget && setAbierto(null)}>
          <div className="detalle">
            <button className="close-x" onClick={() => setAbierto(null)}>
              ✕
            </button>
            <h2>
              {abierto.id}
              {abierto.oc ? ` · ${abierto.oc}` : ""}
            </h2>
            <div className="sub">
              {abierto.cliente} — {abierto.contacto}
            </div>

            {abierto.columnaDespacho === "ingreso" ? (
              <div className="row" style={{ background: "var(--teal-tint)", padding: "12px 14px", borderRadius: 10, marginBottom: 14 }}>
                <div style={{ width: "100%", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--teal)", fontWeight: 700, marginBottom: 2 }}>
                  ① Clasificar ingreso
                </div>
                <div className="field">
                  <div className="label">Documento</div>
                  <select
                    className="motivo-select"
                    style={{ padding: "4px 8px", fontSize: 12.5 }}
                    value={claDocumento}
                    onChange={(e) => setClaDocumento(e.target.value)}
                  >
                    <option value="">Seleccionar…</option>
                    {TIPOS_DOCUMENTO.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <div className="label">Modo de despacho</div>
                  <select className="motivo-select" style={{ padding: "4px 8px", fontSize: 12.5 }} value={claModo} onChange={(e) => setClaModo(e.target.value)}>
                    <option value="">Seleccionar…</option>
                    {MODOS_DESPACHO.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                {claModo === "Starken(Sendu)" && (
                  <div className="field">
                    <div className="label">N° de OT (de Sendu)</div>
                    <input
                      className="motivo-select"
                      style={{ padding: "4px 8px", fontSize: 12.5 }}
                      placeholder="Pégala desde Sendu"
                      value={claOtSendu}
                      onChange={(e) => setClaOtSendu(e.target.value)}
                    />
                  </div>
                )}
                <div className="field">
                  <div className="label">Columna destino</div>
                  <select className="motivo-select" style={{ padding: "4px 8px", fontSize: 12.5 }} value={claDestino} onChange={(e) => setClaDestino(e.target.value)}>
                    <option value="">Seleccionar…</option>
                    {DESTINOS_INGRESO.map((d) => (
                      <option key={d.id} value={d.id}>{d.nombre}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <div className="label">Situación de cobro</div>
                  <select
                    className="motivo-select"
                    style={{ padding: "4px 8px", fontSize: 12.5 }}
                    value={claSituacionCobro}
                    onChange={(e) => setClaSituacionCobro(e.target.value)}
                  >
                    <option value="">Sin marcar</option>
                    <option value="Pendiente de pago">Pendiente de pago</option>
                  </select>
                </div>
                <div className="field">
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={claFacturaAnticipada}
                      onChange={(e) => setClaFacturaAnticipada(e.target.checked)}
                    />
                    Factura anticipada
                  </label>
                </div>
                <div className="field">
                  <div className="label">Vendedor</div>
                  <div className="value">{abierto.vendedor}</div>
                </div>
                {claError && <div style={{ width: "100%", color: "var(--red)", fontSize: 12.5 }}>{claError}</div>}
                <div style={{ width: "100%" }}>
                  <button className="link-btn" style={{ textDecoration: "none", fontSize: 13 }} onClick={confirmarClasificacion}>
                    ✓ Confirmar clasificación →
                  </button>
                </div>
              </div>
            ) : (
              <div className="row">
                <div className="field">
                  <div className="label">Situación de cobro</div>
                  <select
                    className="motivo-select"
                    style={{ padding: "4px 8px", fontSize: 12.5 }}
                    value={abierto.situacionCobro ?? ""}
                    onChange={(e) =>
                      actualizarSituacionCobro(abierto.id, e.target.value || null).then((res) => {
                        mostrarToast(`${abierto.id}: situación de cobro actualizada`, res.historialId);
                        refrescar();
                      })
                    }
                  >
                    <option value="">Sin marcar</option>
                    <option value="Pendiente de pago">Pendiente de pago</option>
                  </select>
                </div>
                <div className="field">
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={abierto.facturaAnticipada}
                      onChange={(e) =>
                        actualizarFacturaAnticipada(abierto.id, e.target.checked).then((res) => {
                          mostrarToast(`${abierto.id}: factura anticipada ${e.target.checked ? "activada" : "desactivada"}`, res.historialId);
                          refrescar();
                        })
                      }
                    />
                    Factura anticipada
                  </label>
                </div>
                <div className="field">
                  <div className="label">Documento</div>
                  <select
                    className="motivo-select"
                    style={{ padding: "4px 8px", fontSize: 12.5 }}
                    value={abierto.documento}
                    onChange={(e) => {
                      actualizarDocumento(abierto.id, e.target.value).then((res) => {
                        if (res.ok) mostrarToast(`${abierto.id}: documento actualizado`, res.historialId);
                        refrescar();
                      });
                    }}
                  >
                    {TIPOS_DOCUMENTO.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <div className="label">Modo de despacho</div>
                  <div className="value">{abierto.modoDespacho}</div>
                </div>
                <div className="field">
                  <div className="label">Vendedor</div>
                  <div className="value">{abierto.vendedor}</div>
                </div>
              </div>
            )}

            <table className="productos">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Producto</th>
                  <th>Cant.</th>
                  <th>Stock</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {abierto.productos.map((prod) => (
                  <tr key={prod.id}>
                    <td>{prod.sku}</td>
                    <td>{prod.nombre}</td>
                    <td>{prod.cantidad}</td>
                    <td>{prod.stock}</td>
                    <td>{badgeStock(prod.estado)}</td>
                    <td style={{ fontSize: 11, color: "var(--ink-soft)" }}>{fechaCorta(prod.actualizadoEn)}</td>
                    <td>
                      <button
                        className="link-btn"
                        onClick={() =>
                          setMoverProducto({
                            productoId: prod.id,
                            cantidad: prod.cantidad,
                            destino: "",
                            motivo: MOTIVOS_MOVER_PRODUCTO[0],
                          })
                        }
                      >
                        🔀 Mover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {moverProducto && (
              <div className="row" style={{ background: "var(--purple-tint)", padding: "12px 14px", borderRadius: 10, marginTop: 10, marginBottom: 14 }}>
                <div style={{ width: "100%", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--purple)", fontWeight: 700, marginBottom: 2 }}>
                  🔀 Mover producto entre pedidos
                </div>
                <div className="field">
                  <div className="label">Cantidad a mover</div>
                  <input
                    type="number"
                    min={1}
                    max={abierto.productos.find((p) => p.id === moverProducto.productoId)?.cantidad ?? 1}
                    className="motivo-select"
                    style={{ padding: "4px 8px", fontSize: 12.5, width: 80 }}
                    value={moverProducto.cantidad}
                    onChange={(e) => setMoverProducto({ ...moverProducto, cantidad: Number(e.target.value) })}
                  />
                </div>
                <div className="field">
                  <div className="label">Pedido destino</div>
                  <input
                    className="motivo-select"
                    style={{ padding: "4px 8px", fontSize: 12.5, width: 130 }}
                    placeholder="PED-XXXXX"
                    value={moverProducto.destino}
                    onChange={(e) => setMoverProducto({ ...moverProducto, destino: e.target.value.toUpperCase() })}
                  />
                </div>
                <div className="field">
                  <div className="label">Motivo</div>
                  <select
                    className="motivo-select"
                    style={{ padding: "4px 8px", fontSize: 12.5 }}
                    value={moverProducto.motivo}
                    onChange={(e) => setMoverProducto({ ...moverProducto, motivo: e.target.value })}
                  >
                    {MOTIVOS_MOVER_PRODUCTO.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                {moverProducto.error && <div style={{ width: "100%", color: "var(--red)", fontSize: 12.5 }}>{moverProducto.error}</div>}
                <div style={{ width: "100%", display: "flex", gap: 10 }}>
                  <button
                    className="link-btn"
                    style={{ textDecoration: "none", fontSize: 13 }}
                    onClick={() => {
                      moverProductoEntrePedidos(
                        abierto.id,
                        moverProducto.productoId,
                        moverProducto.cantidad,
                        moverProducto.destino.trim(),
                        moverProducto.motivo
                      ).then((res) => {
                        if (!res.ok) {
                          setMoverProducto((m) => (m ? { ...m, error: res.error } : m));
                          return;
                        }
                        setMoverProducto(null);
                        setAbierto(null);
                        refrescar();
                      });
                    }}
                  >
                    ✓ Confirmar y sincronizar con Laudus →
                  </button>
                  <button className="link-btn" onClick={() => setMoverProducto(null)}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            <div className="field" style={{ marginTop: 14 }}>
              <div className="label">Adjuntos (se imprimen en bodega)</div>
              {(() => {
                const adjuntos: Adjunto[] = abierto.adjuntos ? JSON.parse(abierto.adjuntos) : [];
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                    {adjuntos.length === 0 && <div style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>Sin adjuntos.</div>}
                    {adjuntos.map((a, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                        <a href={a.dataUrl} download={a.nombre} style={{ color: "var(--teal)", fontWeight: 600 }}>
                          📎 {a.nombre}
                        </a>
                        <button
                          className="link-btn"
                          onClick={() =>
                            eliminarAdjunto(abierto.id, i).then((res) => {
                              if (res.ok) mostrarToast(`${abierto.id}: adjunto eliminado`, res.historialId);
                              refrescar();
                            })
                          }
                        >
                          quitar
                        </button>
                      </div>
                    ))}
                    <div>
                      <input ref={fileInputRef} type="file" style={{ display: "none" }} onChange={onArchivoAdjunto} />
                      <button
                        className="link-btn"
                        disabled={subiendo}
                        onClick={() => fileInputRef.current?.click()}
                        style={{ marginTop: 4 }}
                      >
                        {subiendo ? "Subiendo…" : "+ Adjuntar archivo"}
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>

            {(() => {
              const cacho = cachos.find((c) => c.pedidoId === abierto.id);
              if (!cacho) return null;
              return (
                <div className="field" style={{ marginTop: 14 }}>
                  <div className="label">Comentario (cacho)</div>
                  <div className="cacho-card" style={{ marginTop: 4 }}>
                    <div className="cacho-texto">{cacho.texto}</div>
                    <div className="cacho-meta">
                      {cacho.autor ? `${cacho.autor} — ` : ""}
                      {fechaCorta(cacho.creadoEn)}
                    </div>
                    {cacho.comentarios.length > 0 && (
                      <div className="cacho-comentarios">
                        {cacho.comentarios.map((cm) => (
                          <div key={cm.id} className="cacho-comentario">
                            <span className="cacho-comentario-autor">{cm.autor || "Anónimo"}:</span> {cm.texto}
                            <span className="cacho-comentario-fecha"> — {fechaCorta(cm.creadoEn)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <form
                      className="cacho-comentar"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const texto = comentarios[cacho.id] ?? "";
                        if (!texto.trim()) return;
                        comentarCacho(cacho.id, texto, autor).then(() => {
                          setComentarios((prev) => ({ ...prev, [cacho.id]: "" }));
                          refrescar();
                        });
                      }}
                    >
                      <input
                        className="motivo-select"
                        style={{ fontSize: 12.5, padding: "5px 8px" }}
                        placeholder="Comentar…"
                        value={comentarios[cacho.id] ?? ""}
                        onChange={(e) => setComentarios((prev) => ({ ...prev, [cacho.id]: e.target.value }))}
                      />
                      <button type="submit" className="link-btn">
                        Comentar
                      </button>
                    </form>
                    <div className="cacho-acciones">
                      {!cacho.resuelto ? (
                        <button className="link-btn" onClick={() => resolverCacho(cacho.id).then(refrescar)}>
                          ✓ Marcar resuelto
                        </button>
                      ) : (
                        <button className="link-btn" onClick={() => reabrirCacho(cacho.id).then(refrescar)}>
                          ↩ Reabrir
                        </button>
                      )}
                      <button className="link-btn" style={{ color: "var(--red)" }} onClick={() => eliminarCacho(cacho.id).then(refrescar)}>
                        Eliminar
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

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

            <div className="guardar-cerrar">
              {abierto.productos.some((p) => p.estado === "bloqueado") && abierto.columnaDespacho !== "cachos" && (
                <button
                  className="btn-secundario"
                  style={{ borderColor: "var(--black)" }}
                  onClick={() =>
                    avisarVendedorGenerico(abierto.id).then((res) => {
                      if (!res.ok) {
                        alert(res.error);
                        return;
                      }
                      mostrarToast(`${abierto.id}: vendedor avisado — SKU genérico`, res.historialId);
                      setAbierto(null);
                      refrescar();
                    })
                  }
                >
                  ⚠ Avisar al vendedor (SKU genérico)
                </button>
              )}
              {abierto.columnaDespacho === "en_transito" && (
                <button
                  className="btn-secundario"
                  onClick={() =>
                    marcarEntregado(abierto.id).then((res) => {
                      if (!res.ok) {
                        alert(res.error);
                        return;
                      }
                      mostrarToast(`${abierto.id}: marcado como entregado`, res.historialId);
                      setAbierto(null);
                      refrescar();
                    })
                  }
                >
                  📦 Marcar entregado (simulado)
                </button>
              )}
              {!["entregado"].includes(abierto.columnaDespacho) && (
                <button className="btn-secundario" onClick={() => setEliminando(true)}>
                  🗑 Eliminar pedido
                </button>
              )}
              <button onClick={() => setAbierto(null)}>✓ Guardar y cerrar</button>
            </div>
          </div>
        </div>
      )}

      {abierto && eliminando && (
        <div className="overlay open">
          <div className="detalle">
            <button className="close-x" onClick={() => setEliminando(false)}>
              ✕
            </button>
            <h2>Eliminar {abierto.id}</h2>
            <div className="sub">{abierto.cliente} — se descarta el pedido completo</div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const motivo = (e.currentTarget.elements.namedItem("motivo") as HTMLSelectElement).value;
                if (!motivo) return;
                eliminarPedido(abierto.id, motivo).then((res) => {
                  setEliminando(false);
                  setAbierto(null);
                  if (res.ok) mostrarToast(`${abierto.id}: pedido eliminado`, res.historialId);
                  refrescar();
                });
              }}
            >
              <div className="field" style={{ marginBottom: 14 }}>
                <div className="label">Motivo (obligatorio)</div>
                <select name="motivo" className="motivo-select" required defaultValue="">
                  <option value="" disabled>
                    Selecciona un motivo…
                  </option>
                  {MOTIVOS_CANCELACION.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div className="guardar-cerrar">
                <button type="button" className="btn-secundario" onClick={() => setEliminando(false)}>
                  Volver
                </button>
                <button type="submit" className="btn-peligro">
                  Confirmar eliminación
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {transformacion && (
        <div className="overlay open" onClick={(e) => e.target === e.currentTarget && setTransformacion(null)}>
          <div className="detalle">
            <button className="close-x" onClick={() => setTransformacion(null)}>
              ✕
            </button>
            <h2>Confirmar transformación</h2>
            <div className="sub">
              {transformacion.pedidoId} — este pedido arma productos con receta antes de pasar a Despacho.
            </div>

            {transformacion.productos.map((p) => (
              <div key={p.id} style={{ marginBottom: 14 }}>
                <div className="label" style={{ marginBottom: 4 }}>
                  {p.nombre} × {p.cantidad}
                </div>
                <table className="productos">
                  <thead>
                    <tr>
                      <th>Componente</th>
                      <th>Necesario</th>
                      <th>Stock</th>
                      <th>¿Alcanza?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.componentes.map((c) => (
                      <tr key={c.sku}>
                        <td>{c.nombre}</td>
                        <td>{c.necesario}</td>
                        <td>{c.stockDisponible}</td>
                        <td>{c.alcanza ? <span className="badge stock_ok">✓ Alcanza</span> : <span className="badge stock_falta">⚠ Falta</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

            {transformacion.error && <div style={{ color: "var(--red)", fontSize: 12.5, marginBottom: 10 }}>{transformacion.error}</div>}

            <div className="guardar-cerrar">
              <button className="btn-secundario" onClick={() => setTransformacion(null)}>
                Cancelar
              </button>
              <button onClick={confirmarTransformacionPendiente}>✓ Confirmar transformación</button>
            </div>
          </div>
        </div>
      )}

      {abonoPendiente && (
        <div className="overlay open" onClick={(e) => e.target === e.currentTarget && setAbonoPendiente(null)}>
          <div className="detalle">
            <button className="close-x" onClick={() => setAbonoPendiente(null)}>
              ✕
            </button>
            <h2>Solicitar abono</h2>
            <div className="sub">
              {abonoPendiente.pedidoId} — tiene productos sin stock; se necesita un abono para poder pedir a Compras.
              Queda en «Pendiente de pago» hasta que Cobranzas revise la cartola.
            </div>

            <div className="field" style={{ marginBottom: 14 }}>
              <div className="label">Monto del abono</div>
              <input
                type="number"
                min={1}
                className="motivo-select"
                value={abonoPendiente.monto}
                onChange={(e) => setAbonoPendiente({ ...abonoPendiente, monto: e.target.value })}
              />
            </div>
            <div className="field" style={{ marginBottom: 14 }}>
              <div className="label">Nota (opcional)</div>
              <textarea
                className="motivo-textarea"
                rows={2}
                value={abonoPendiente.nota}
                onChange={(e) => setAbonoPendiente({ ...abonoPendiente, nota: e.target.value })}
              />
            </div>

            {abonoPendiente.error && <div style={{ color: "var(--red)", fontSize: 12.5, marginBottom: 10 }}>{abonoPendiente.error}</div>}

            <div className="guardar-cerrar">
              <button className="btn-secundario" onClick={() => setAbonoPendiente(null)}>
                Cancelar
              </button>
              <button onClick={confirmarAbonoPendiente}>✓ Registrar abono solicitado</button>
            </div>
          </div>
        </div>
      )}

      {pendientes.length > 0 && (
        <div className="barra-confirmar">
          <div className="barra-confirmar-lista">
            {pendientes.map((p) => (
              <div key={p.historialId} className="barra-confirmar-item">
                <span>{p.mensaje}</span>
                <button onClick={() => deshacer(p.historialId)}>↩ Deshacer</button>
              </div>
            ))}
          </div>
          <button className="btn-confirmar-acciones" onClick={confirmarAcciones}>
            ✓ Confirmar acciones ({pendientes.length})
          </button>
        </div>
      )}
    </>
  );
}
