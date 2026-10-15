"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CuentaPorPagar } from "@prisma/client";
import { calcUrgencia, type Urgencia } from "@/lib/dominio";
import { registrarPagoCuenta } from "./actions";

const MEDIOS_PAGO = ["Transferencia", "Cheque", "Tarjeta", "Efectivo"];

const TABS = [
  { id: "todas", nombre: "Todas" },
  { id: "Crédito", nombre: "A crédito" },
  { id: "Anticipo", nombre: "Anticipos" },
  { id: "Contra entrega", nombre: "Contra entrega" },
] as const;

const BORDE_MODALIDAD: Record<string, string> = {
  "Anticipo": "#534AB7",
  "Contra entrega": "#1F8A7A",
  "Crédito": "#2F6FB0",
};

const CHIP_URGENCIA: Record<Urgencia, { color: string; bg: string; texto: string }> = {
  vencida: { color: "#C8102E", bg: "#FBE7EA", texto: "Vencida" },
  esta_semana: { color: "#C8871F", bg: "#FBEEDA", texto: "Esta semana" },
  por_pagar: { color: "#2F6FB0", bg: "#E9F1F8", texto: "Por pagar" },
  pagada: { color: "#1F8A7A", bg: "#E4F3EE", texto: "Pagada" },
};

function clp(n: number) {
  return n.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
}

function fecha(d: Date | string | null) {
  return d ? new Date(d).toLocaleDateString("es-CL") : "—";
}

export default function FinanzasBoard({ cuentas }: { cuentas: CuentaPorPagar[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("todas");
  const [pagando, setPagando] = useState<CuentaPorPagar | null>(null);
  const [monto, setMonto] = useState("");
  const [medioPago, setMedioPago] = useState(MEDIOS_PAGO[0]);
  const [fechaPago, setFechaPago] = useState(new Date().toISOString().slice(0, 10));
  const [numeroOperacion, setNumeroOperacion] = useState("");
  const [comprobante, setComprobante] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const cuentasFiltradas = tab === "todas" ? cuentas : cuentas.filter((c) => c.modalidad === tab);
  const pendientes = cuentas.filter((c) => c.estado !== "pagada");
  const vencidas = pendientes.filter((c) => calcUrgencia(c.estado, c.fechaVencimiento) === "vencida").length;
  const estaSemana = pendientes.filter((c) => calcUrgencia(c.estado, c.fechaVencimiento) === "esta_semana").length;
  const anticiposPendientes = pendientes.filter((c) => c.modalidad === "Anticipo").length;
  const totalPorPagar = pendientes.reduce((a, c) => a + (c.monto - c.montoPagado), 0);

  function abrirPago(c: CuentaPorPagar) {
    setPagando(c);
    setMonto(String(c.monto - c.montoPagado));
    setMedioPago(MEDIOS_PAGO[0]);
    setFechaPago(new Date().toISOString().slice(0, 10));
    setNumeroOperacion("");
    setComprobante("");
    setAviso(null);
  }

  async function confirmarPago() {
    if (!pagando) return;
    setEnviando(true);
    setAviso(null);
    const res = await registrarPagoCuenta(pagando.id, {
      fechaPago, medioPago, numeroOperacion, monto: Number(monto), comprobante,
    });
    setEnviando(false);
    if (!res.ok) {
      setAviso(res.error ?? "No se pudo registrar el pago.");
      return;
    }
    setPagando(null);
    router.refresh();
  }

  return (
    <main style={{ padding: "20px 24px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 18, maxWidth: 820 }}>
        <div style={{ background: "#FBE7EA", borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 11, color: "#63636B", fontWeight: 700, textTransform: "uppercase" }}>Vencidas</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#C8102E" }}>{vencidas}</div>
        </div>
        <div style={{ background: "#FBEEDA", borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 11, color: "#63636B", fontWeight: 700, textTransform: "uppercase" }}>Pagar esta semana</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#C8871F" }}>{estaSemana}</div>
        </div>
        <div style={{ background: "#EDECFB", borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 11, color: "#63636B", fontWeight: 700, textTransform: "uppercase" }}>Anticipos pendientes</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#534AB7" }}>{anticiposPendientes}</div>
        </div>
        <div style={{ background: "#EEEEF1", borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 11, color: "#63636B", fontWeight: 700, textTransform: "uppercase" }}>Total por pagar</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{clp(totalPorPagar)}</div>
        </div>
      </div>

      <div className="tabs" style={{ padding: "0 0 0 0", marginBottom: 14 }}>
        {TABS.map((t) => (
          <button key={t.id} className={"tab" + (tab === t.id ? " active" : "")} onClick={() => setTab(t.id)}>
            {t.nombre}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 820 }}>
        {cuentasFiltradas.length === 0 && <p style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>Sin cuentas por pagar en esta vista.</p>}
        {cuentasFiltradas.map((c) => {
          const urgencia = calcUrgencia(c.estado, c.fechaVencimiento);
          const chip = CHIP_URGENCIA[urgencia];
          const saldo = c.monto - c.montoPagado;
          return (
            <div
              key={c.id}
              style={{
                background: "#fff", borderRadius: 10, padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center",
                borderLeft: `4px solid ${BORDE_MODALIDAD[c.modalidad] ?? "#ccc"}`, border: "1px solid var(--line)", borderLeftWidth: 4,
                borderLeftColor: BORDE_MODALIDAD[c.modalidad] ?? "#ccc",
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>
                  {c.proveedor} — {c.ordenCompraId} <span style={{ fontWeight: 400, color: "var(--ink-soft)" }}>· F° {c.facturaNumero}</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 2 }}>
                  {c.modalidad} · emisión {fecha(c.facturaFechaEmision)}
                  {c.fechaVencimiento ? ` · vence ${fecha(c.fechaVencimiento)}` : " · sin vencimiento (paga por disparador propio)"}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>
                  {clp(saldo)} {c.montoPagado > 0 && <span style={{ fontWeight: 400, color: "var(--ink-soft)" }}>de {clp(c.monto)}</span>}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                <span style={{ background: chip.bg, color: chip.color, fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 100 }}>
                  {chip.texto}
                </span>
                {c.estado !== "pagada" && <button className="link-btn" onClick={() => abrirPago(c)}>Registrar pago</button>}
              </div>
            </div>
          );
        })}
      </div>

      {pagando && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setPagando(null)}>
          <div className="detalle">
            <button className="close-x" onClick={() => setPagando(null)}>✕</button>
            <h2>Registrar pago</h2>
            <div className="sub">{pagando.proveedor} — {pagando.ordenCompraId} · F° {pagando.facturaNumero}</div>

            <div className="row" style={{ marginTop: 14 }}>
              <div className="field">
                <div className="label">Fecha de pago</div>
                <input type="date" className="motivo-select" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} />
              </div>
              <div className="field">
                <div className="label">Medio de pago</div>
                <select className="motivo-select" value={medioPago} onChange={(e) => setMedioPago(e.target.value)}>
                  {MEDIOS_PAGO.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <div className="label">N° de operación</div>
                <input className="motivo-select" value={numeroOperacion} onChange={(e) => setNumeroOperacion(e.target.value)} />
              </div>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <div className="field">
                <div className="label">Monto a pagar (saldo {clp(pagando.monto - pagando.montoPagado)})</div>
                <input type="number" className="motivo-select" value={monto} onChange={(e) => setMonto(e.target.value)} />
                {Number(monto) < pagando.monto - pagando.montoPagado && (
                  <p style={{ fontSize: 11.5, color: "var(--amber)", marginTop: 4 }}>
                    Pago parcial — queda saldo pendiente con nuevo vencimiento.
                  </p>
                )}
              </div>
              <div className="field" style={{ flex: 1 }}>
                <div className="label">Comprobante (opcional)</div>
                <input className="motivo-select" value={comprobante} onChange={(e) => setComprobante(e.target.value)} />
              </div>
            </div>

            {aviso && <p style={{ color: "var(--red)", fontSize: 12.5, marginTop: 10 }}>{aviso}</p>}

            <div className="guardar-cerrar">
              <button className="btn-secundario" onClick={() => setPagando(null)} disabled={enviando}>
                ‹ Atrás
              </button>
              <button onClick={confirmarPago} disabled={enviando}>
                {enviando ? "Guardando…" : "✓ Confirmar pago"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
