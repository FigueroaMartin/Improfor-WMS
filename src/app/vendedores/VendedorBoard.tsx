"use client";

import { useState } from "react";
import type { PedidoConProductos } from "@/lib/dominio";
import type { Vendedor } from "@prisma/client";
import { guardarVendedor, cambiarActivoVendedor } from "./actions";

const COLUMNAS_VENDEDOR = [
  { id: "nuevo", nombre: "Nuevo / por gestionar" },
  { id: "pendiente_pago", nombre: "Pendiente de pago" },
  { id: "en_compras", nombre: "En compras · Por pedir" },
  { id: "en_bodega", nombre: "En bodega · preparando" },
  { id: "en_transito", nombre: "En tránsito" },
  { id: "entregado", nombre: "Entregado" },
  // Al final para no correr el "próximo hito" de las columnas normales —
  // puede llegar acá desde cualquier etapa (SKU genérico sin corregir,
  // problema de entrega reportado por Robinson, etc.).
  { id: "con_problema", nombre: "⚠ Con problema" },
];

type Item = PedidoConProductos & { columnaVendedor: string };

function diasDesde(fecha: Date | string) {
  return Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000);
}

function clp(n: number) {
  return n.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
}

function badgeEstadoProducto(estado: string) {
  if (estado === "falta") return <span className="badge stock_falta">Falta stock</span>;
  if (estado === "bloqueado") return <span className="badge stock_bloqueado">Bloqueado</span>;
  return <span className="badge stock_ok">Stock OK</span>;
}

// Próximo hito — la etiqueta de la columna siguiente en el flujo. Útil en
// la lista para saber "qué viene" sin tener que abrir el detalle.
function proximoHito(columnaVendedor: string) {
  const i = COLUMNAS_VENDEDOR.findIndex((c) => c.id === columnaVendedor);
  if (i === -1 || i === COLUMNAS_VENDEDOR.length - 1) return "—";
  return COLUMNAS_VENDEDOR[i + 1].nombre;
}

export default function VendedorBoard({
  items,
  vendedores,
  esAdmin,
  pendientesPago,
  conteoTransportistas,
  conteoProveedores,
  conteoProductos,
  vendedoresMaestro,
}: {
  items: Item[];
  vendedores: string[];
  esAdmin: boolean;
  pendientesPago: PedidoConProductos[];
  conteoTransportistas: number;
  conteoProveedores: number;
  conteoProductos: number;
  vendedoresMaestro: Vendedor[];
}) {
  const [tab, setTab] = useState<"vendedor" | "admin" | "pendientes_pago">("vendedor");
  const [abierto, setAbierto] = useState<Item | null>(null);
  const [filtroVendedor, setFiltroVendedor] = useState("Todos");
  const [busqueda, setBusqueda] = useState("");
  const [listaVendedores, setListaVendedores] = useState(vendedoresMaestro);
  const [nuevoVendedor, setNuevoVendedor] = useState("");

  const itemsFiltrados = (esAdmin && filtroVendedor !== "Todos" ? items.filter((p) => p.vendedor === filtroVendedor) : items).filter(
    (p) =>
      !busqueda.trim() ||
      p.id.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.cliente.toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <>
      <div className="tabs">
        <button className={"tab" + (tab === "vendedor" ? " active" : "")} onClick={() => setTab("vendedor")}>
          Panel del vendedor
        </button>
        <button className={"tab" + (tab === "admin" ? " active" : "")} onClick={() => setTab("admin")}>
          Administración — hub de maestros
        </button>
        {esAdmin && (
          <button className={"tab" + (tab === "pendientes_pago" ? " active" : "")} onClick={() => setTab("pendientes_pago")}>
            Pendientes de pago {pendientesPago.length > 0 && `(${pendientesPago.length})`}
          </button>
        )}
      </div>

      {tab === "vendedor" && (
        <main className="board">
          <div style={{ gridColumn: "1 / -1", marginBottom: 10, display: "flex", gap: 10 }}>
            <input
              className="motivo-select"
              style={{ maxWidth: 220 }}
              placeholder="Buscar por N° de pedido o cliente…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
            {esAdmin && (
              <select className="motivo-select" value={filtroVendedor} onChange={(e) => setFiltroVendedor(e.target.value)}>
                <option value="Todos">Todos los vendedores ({items.length})</option>
                {vendedores.map((v) => (
                  <option key={v} value={v}>{v} ({items.filter((p) => p.vendedor === v).length})</option>
                ))}
              </select>
            )}
          </div>
          {COLUMNAS_VENDEDOR.map((col) => {
            const colItems = itemsFiltrados.filter((p) => p.columnaVendedor === col.id);
            return (
              <div key={col.id} className="column">
                <div className="column-head">
                  <span className="name">{col.nombre}</span>
                  <span className="count">{colItems.length}</span>
                </div>
                <div className="cards">
                  {colItems.map((p) => (
                    <div
                      key={p.id}
                      className={"pedido-card" + (p.nuevo ? " nuevo" : "")}
                      onClick={() => setAbierto(p)}
                    >
                      {p.nuevo && <span className="nuevo-marker">＊</span>}
                      <div className="id">{p.id}</div>
                      <div className="cliente">{p.cliente}</div>
                      <div style={{ fontSize: 11, color: "var(--ink-soft)", margin: "2px 0" }}>
                        Próximo hito: {proximoHito(p.columnaVendedor)} · Vía: {p.modoDespacho}
                      </div>
                      <div className="meta">
                        <span className="badge ok">{p.vendedor}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </main>
      )}

      {abierto && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setAbierto(null)}>
          <div className="detalle">
            <button className="close-x" onClick={() => setAbierto(null)}>
              ✕
            </button>
            <h2>{abierto.id}</h2>
            <div className="sub">
              {abierto.cliente} — {abierto.contacto}
            </div>

            <div className="linea-tiempo">
              {COLUMNAS_VENDEDOR.map((col, i) => {
                const idxActual = COLUMNAS_VENDEDOR.findIndex((c) => c.id === abierto.columnaVendedor);
                const estado = i < idxActual ? "hecho" : i === idxActual ? "actual" : "pendiente";
                return (
                  <div key={col.id} className={`hito ${estado}`}>
                    <span className="punto" />
                    <span className="hito-label">{col.nombre}</span>
                  </div>
                );
              })}
            </div>

            <div className="row">
              <div className="field">
                <div className="label">Documento</div>
                <div className="value">{abierto.documento}</div>
              </div>
              <div className="field">
                <div className="label">Modo de despacho</div>
                <div className="value">{abierto.modoDespacho}</div>
              </div>
              <div className="field">
                <div className="label">Situación de cobro</div>
                <div className="value">{abierto.situacionCobro || "—"}</div>
              </div>
              <div className="field">
                <div className="label">Vendedor</div>
                <div className="value">{abierto.vendedor}</div>
              </div>
            </div>

            <table className="productos">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Producto</th>
                  <th>Cant.</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {abierto.productos.map((prod) => (
                  <tr key={prod.id}>
                    <td>{prod.sku}</td>
                    <td>{prod.nombre}</td>
                    <td>{prod.cantidad}</td>
                    <td>{badgeEstadoProducto(prod.estado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 10 }}>
              Vista de solo lectura — sin montos. Los precios y condiciones comerciales se ven en el ERP.
            </p>

            <div className="guardar-cerrar">
              <button onClick={() => setAbierto(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {tab === "admin" && (
        <>
          <div className="maestros-grid">
            <a href="/compras" className="maestro-tile" style={{ textDecoration: "none", color: "inherit" }}>
              <div className="maestro-nombre">Transportistas ({conteoTransportistas})</div>
              <span className="badge ok">Propio del sistema</span>
              <div className="maestro-detalle">Couriers, consolidadores y nacionales + URL de rastreo — gestionar en Compras</div>
            </a>
            <a href="/compras" className="maestro-tile" style={{ textDecoration: "none", color: "inherit" }}>
              <div className="maestro-nombre">Proveedores ({conteoProveedores})</div>
              <span className="badge factura_anticipada">Mixto</span>
              <div className="maestro-detalle">Rutas + modalidad de pago (propio) · condición de pago (Laudus) — gestionar en Compras</div>
            </a>
            <div className="maestro-tile">
              <div className="maestro-nombre">Clientes</div>
              <span className="badge factura_anticipada">Mixto</span>
              <div className="maestro-detalle">Identidad (Laudus) · facturación y contactos (propio) — gestionar en Cobranzas</div>
            </div>
            <a href="/compras" className="maestro-tile" style={{ textDecoration: "none", color: "inherit" }}>
              <div className="maestro-nombre">Productos de stock ({conteoProductos})</div>
              <span className="badge stock_falta">Lee de Laudus</span>
              <div className="maestro-detalle">Mín/máx, disponible — vía API — gestionar en Compras</div>
            </a>
            <div className="maestro-tile">
              <div className="maestro-nombre">Vendedores ({listaVendedores.length})</div>
              <span className="badge ok">Propio del sistema</span>
              <div className="maestro-detalle">Equipo comercial — editable abajo</div>
            </div>
            <div className="maestro-tile">
              <div className="maestro-nombre">Usuarios y permisos</div>
              <span className="badge">Por diseñar</span>
              <div className="maestro-detalle">Matriz de permisos por rol — pendiente (§5 #8)</div>
            </div>
          </div>

          <div style={{ marginTop: 20, maxWidth: 420 }}>
            <div className="label" style={{ marginBottom: 6 }}>Maestro de vendedores</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
              {listaVendedores.map((v) => (
                <div key={v.nombre} style={{ background: "var(--grey-tint)", borderRadius: 8, padding: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12.5 }}>
                    {v.nombre} {!v.activo && <span className="badge">Inactivo</span>}
                  </span>
                  <button
                    className="link-btn"
                    onClick={async () => {
                      await cambiarActivoVendedor(v.nombre, !v.activo);
                      setListaVendedores((prev) => prev.map((x) => (x.nombre === v.nombre ? { ...x, activo: !x.activo } : x)));
                    }}
                  >
                    {v.activo ? "Desactivar" : "Activar"}
                  </button>
                </div>
              ))}
              {listaVendedores.length === 0 && <p style={{ fontSize: 12, color: "var(--ink-soft)" }}>Sin vendedores cargados todavía.</p>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                className="motivo-select"
                placeholder="Nombre del vendedor"
                value={nuevoVendedor}
                onChange={(e) => setNuevoVendedor(e.target.value)}
              />
              <button
                onClick={async () => {
                  const res = await guardarVendedor(nuevoVendedor);
                  if (!res.ok) return alert(res.error);
                  setListaVendedores((prev) => [...prev, { nombre: nuevoVendedor, activo: true }].sort((a, b) => a.nombre.localeCompare(b.nombre)));
                  setNuevoVendedor("");
                }}
              >
                + Agregar
              </button>
            </div>
          </div>
        </>
      )}

      {tab === "pendientes_pago" && (
        <div style={{ padding: "0 4px" }}>
          <p style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 12 }}>
            Solo lectura — el pago lo confirma Cobranzas. Antigüedad = días desde que se creó el pedido.
          </p>
          {pendientesPago.length === 0 && <p style={{ fontSize: 12.5 }}>Sin pedidos pendientes de pago.</p>}
          <table className="productos">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Cliente</th>
                <th>Vendedor</th>
                <th>Total</th>
                <th>Pagado</th>
                <th>Saldo</th>
                <th>Antigüedad</th>
              </tr>
            </thead>
            <tbody>
              {pendientesPago.map((p) => {
                // Abono en 2 pasos (§5f.5) — todavía no hay factura real,
                // así que facturaTotal/facturaPagado son null. Sin esto, la
                // fila mostraba $0 en todo como si no hubiera nada pendiente.
                const esAbono = p.abonoMonto != null;
                const total = esAbono ? p.abonoMonto! : p.facturaTotal ?? 0;
                const pagado = esAbono ? 0 : p.facturaPagado ?? 0;
                const saldo = total - pagado;
                const dias = diasDesde(p.creadoEn);
                return (
                  <tr key={p.id}>
                    <td>{p.id}</td>
                    <td>{p.cliente}</td>
                    <td>{p.vendedor}</td>
                    <td>{esAbono ? <span className="badge factura_anticipada">Abono</span> : clp(total)}</td>
                    <td>{esAbono ? "—" : clp(pagado)}</td>
                    <td style={{ fontWeight: 600 }}>{clp(saldo)}</td>
                    <td>
                      <span className={"badge " + (dias >= 15 ? "stock_bloqueado" : dias >= 7 ? "pendiente_pago" : "stock_ok")}>
                        {dias}d
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
