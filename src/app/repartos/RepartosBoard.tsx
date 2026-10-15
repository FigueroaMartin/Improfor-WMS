"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Pedido, Aviso } from "@prisma/client";
import {
  cerrarEntregaRobinson,
  reportarProblemaRobinson,
  obtenerAvisosRobinson,
  marcarAvisoLeidoRobinson,
  marcarTodosAvisosLeidosRobinson,
} from "./actions";

const INTERVALO_MS = 10000;

// Achica la foto antes de guardarla — mismo criterio que en Bodega.
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

export default function RepartosBoard({
  pedidos,
  historial,
  avisosIniciales,
}: {
  pedidos: Pedido[];
  historial: Pedido[];
  avisosIniciales: Aviso[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"repartos" | "historial">("repartos");
  const [avisos, setAvisos] = useState(avisosIniciales);
  const [abiertoAvisos, setAbiertoAvisos] = useState(false);
  const vistosRef = useRef<Set<number>>(new Set(avisosIniciales.map((a) => a.id)));

  const [cerrando, setCerrando] = useState<Pedido | null>(null);
  const [foto, setFoto] = useState<string | null>(null);
  const [tomandoFoto, setTomandoFoto] = useState(false);
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reportar un problema en la entrega (modo alterno dentro del mismo
  // pedido "en transporte" — no cierra como entregado).
  const [reportando, setReportando] = useState<Pedido | null>(null);
  const [motivoProblema, setMotivoProblema] = useState("");
  const [enviandoProblema, setEnviandoProblema] = useState(false);
  const [avisoProblema, setAvisoProblema] = useState<string | null>(null);

  useEffect(() => {
    const intervalo = setInterval(async () => {
      const frescos = await obtenerAvisosRobinson();
      const nuevos = frescos.filter((a) => !vistosRef.current.has(a.id));
      if (nuevos.length > 0) {
        for (const a of nuevos) {
          vistosRef.current.add(a.id);
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            new Notification("Improfor · Repartos", { body: a.mensaje, tag: `aviso-${a.id}` });
          }
        }
        router.refresh();
      }
      setAvisos(frescos);
    }, INTERVALO_MS);
    return () => clearInterval(intervalo);
  }, [router]);

  async function pedirPermiso() {
    if (typeof Notification === "undefined") return;
    await Notification.requestPermission();
  }

  const paraRetirar = pedidos.filter((p) => p.columnaDespacho === "listo_retiro");
  const enTransporte = pedidos.filter((p) => p.columnaDespacho === "en_transito");

  function abrirCierre(p: Pedido) {
    setCerrando(p);
    setFoto(null);
    setComentario("");
    setAviso(null);
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

  async function confirmarEntrega() {
    if (!cerrando) return;
    if (!foto) return setAviso("Falta la foto de la guía firmada — no se puede cerrar sin ella.");
    setEnviando(true);
    setAviso(null);
    const res = await cerrarEntregaRobinson(cerrando.id, foto, comentario);
    setEnviando(false);
    if (!res.ok) {
      setAviso(res.error ?? "No se pudo cerrar la entrega.");
      return;
    }
    setCerrando(null);
    router.refresh();
  }

  function abrirReporte(p: Pedido) {
    setReportando(p);
    setMotivoProblema("");
    setAvisoProblema(null);
  }

  async function confirmarProblema() {
    if (!reportando) return;
    if (!motivoProblema.trim()) return setAvisoProblema("Cuenta qué pasó con la entrega.");
    setEnviandoProblema(true);
    setAvisoProblema(null);
    const res = await reportarProblemaRobinson(reportando.id, motivoProblema);
    setEnviandoProblema(false);
    if (!res.ok) {
      setAvisoProblema(res.error ?? "No se pudo reportar el problema.");
      return;
    }
    setReportando(null);
    router.refresh();
  }

  return (
    <main style={{ padding: 20, maxWidth: 640, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10, position: "relative" }}>
        <button className="link-btn" onClick={() => setAbiertoAvisos((v) => !v)}>
          🔔 Avisos {avisos.length > 0 && `(${avisos.length})`}
        </button>
        {abiertoAvisos && (
          <div
            style={{
              position: "absolute", top: 28, right: 0, background: "var(--card-bg, #fff)", border: "1px solid var(--line)",
              borderRadius: 8, padding: 10, width: 280, zIndex: 10, boxShadow: "0 4px 16px rgba(0,0,0,.12)",
            }}
          >
            <button className="link-btn" onClick={pedirPermiso} style={{ marginBottom: 8 }}>
              🔔 Activar notificaciones en este dispositivo
            </button>
            {avisos.length === 0 && <p style={{ fontSize: 12, color: "var(--ink-soft)" }}>Sin avisos pendientes.</p>}
            {avisos.map((a) => (
              <div key={a.id} style={{ fontSize: 12, marginBottom: 8 }}>
                <p>{a.mensaje}</p>
                <button
                  className="link-btn"
                  onClick={async () => {
                    await marcarAvisoLeidoRobinson(a.id);
                    setAvisos((prev) => prev.filter((x) => x.id !== a.id));
                  }}
                >
                  Leído
                </button>
              </div>
            ))}
            {avisos.length > 0 && (
              <button
                className="link-btn"
                onClick={async () => {
                  await marcarTodosAvisosLeidosRobinson();
                  setAvisos([]);
                }}
              >
                Marcar todos leídos
              </button>
            )}
          </div>
        )}
      </div>

      <div className="tabs" style={{ marginBottom: 14 }}>
        <button className={"tab" + (tab === "repartos" ? " active" : "")} onClick={() => setTab("repartos")}>
          Mis repartos
        </button>
        <button className={"tab" + (tab === "historial" ? " active" : "")} onClick={() => setTab("historial")}>
          Historial {historial.length > 0 && `(${historial.length})`}
        </button>
      </div>

      {tab === "repartos" && (
        <>
          <h2 style={{ fontSize: 15, marginBottom: 6 }}>Para retirar ({paraRetirar.length})</h2>
          <p style={{ fontSize: 11.5, color: "var(--ink-soft)", marginBottom: 10 }}>
            Bodega te avisa cuando estén listos — coordina el retiro con ellos; acá es solo para que sepas qué viene.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
            {paraRetirar.length === 0 && <p style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>Nada esperando retiro.</p>}
            {paraRetirar.map((p) => (
              <div key={p.id} style={{ background: "var(--grey-tint)", borderRadius: 8, padding: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{p.id} — {p.cliente}</div>
                <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                  {p.direccionEntrega ?? "Dirección —"} {p.comuna ? `· ${p.comuna}` : ""} · {p.bultos ?? "?"} bulto(s)
                </div>
              </div>
            ))}
          </div>

          <h2 style={{ fontSize: 15, marginBottom: 6 }}>En transporte ({enTransporte.length})</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {enTransporte.length === 0 && <p style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>No llevas nada en ruta ahora.</p>}
            {enTransporte.map((p) => (
              <div key={p.id} style={{ background: "var(--grey-tint)", borderRadius: 8, padding: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{p.id} — {p.cliente}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                    {p.direccionEntrega ?? "Dirección —"} {p.comuna ? `· ${p.comuna}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn-secundario" onClick={() => abrirReporte(p)}>⚠️ Problema</button>
                  <button onClick={() => abrirCierre(p)}>Cerrar entrega</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "historial" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {historial.length === 0 && <p style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>Todavía no cierras ninguna entrega.</p>}
          {historial.map((p) => (
            <div key={p.id} style={{ background: "var(--grey-tint)", borderRadius: 8, padding: 10, display: "flex", gap: 10, alignItems: "flex-start" }}>
              {p.fotoEntregaRobinson && (
                <img
                  src={p.fotoEntregaRobinson}
                  alt="Guía firmada"
                  style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6, border: "1px solid var(--line)", flexShrink: 0 }}
                />
              )}
              <div>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{p.id} — {p.cliente}</div>
                <div style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>
                  {new Date(p.actualizadoEn).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })}
                </div>
                {p.comentarioEntregaRobinson && (
                  <div style={{ fontSize: 12, marginTop: 4 }}>"{p.comentarioEntregaRobinson}"</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {cerrando && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setCerrando(null)}>
          <div className="detalle">
            <button className="close-x" onClick={() => setCerrando(null)}>✕</button>
            <h2>Entregar {cerrando.id}</h2>
            <div className="sub">{cerrando.cliente}</div>

            <div className="field" style={{ margin: "14px 0" }}>
              <div className="label">Foto de la guía firmada (obligatoria)</div>
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
                  <img src={foto} alt="Guía firmada" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line)" }} />
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

            <div className="field" style={{ marginBottom: 14 }}>
              <div className="label">Comentarios de la entrega (opcional)</div>
              <textarea
                className="motivo-textarea"
                rows={2}
                placeholder="Ej. recibió el guardia, portería 2"
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
              />
            </div>

            {aviso && <p style={{ color: "var(--red)", fontSize: 12.5, marginBottom: 10 }}>{aviso}</p>}

            <div className="guardar-cerrar">
              <button className="btn-secundario" onClick={() => setCerrando(null)} disabled={enviando}>
                ‹ Atrás
              </button>
              <button onClick={confirmarEntrega} disabled={enviando || !foto}>
                {enviando ? "Cerrando…" : "✓ Confirmar entrega"}
              </button>
            </div>
          </div>
        </div>
      )}

      {reportando && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setReportando(null)}>
          <div className="detalle">
            <button className="close-x" onClick={() => setReportando(null)}>✕</button>
            <h2>⚠️ Problema con {reportando.id}</h2>
            <div className="sub">{reportando.cliente}</div>
            <p style={{ fontSize: 11.5, color: "var(--ink-soft)", margin: "8px 0" }}>
              Esto NO cierra la entrega — el pedido queda parqueado para que Despacho decida el siguiente paso
              (reagendar, contactar al cliente, etc.).
            </p>

            <div className="field" style={{ marginBottom: 14 }}>
              <div className="label">¿Qué pasó?</div>
              <textarea
                className="motivo-textarea"
                rows={3}
                placeholder="Ej. no había nadie en la dirección, el cliente rechazó el pedido, dirección no existe…"
                value={motivoProblema}
                onChange={(e) => setMotivoProblema(e.target.value)}
              />
            </div>

            {avisoProblema && <p style={{ color: "var(--red)", fontSize: 12.5, marginBottom: 10 }}>{avisoProblema}</p>}

            <div className="guardar-cerrar">
              <button className="btn-secundario" onClick={() => setReportando(null)} disabled={enviandoProblema}>
                ‹ Atrás
              </button>
              <button onClick={confirmarProblema} disabled={enviandoProblema}>
                {enviandoProblema ? "Enviando…" : "Reportar problema"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
