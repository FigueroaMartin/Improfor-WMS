"use client";

import { useEffect, useRef, useState } from "react";
import type { Aviso } from "@prisma/client";
import { obtenerAvisosBodega, marcarAvisoLeido, marcarTodosAvisosLeidos } from "./actions";

const INTERVALO_MS = 10000;

export default function AvisosBell({
  avisosIniciales,
  onNuevoAviso,
}: {
  avisosIniciales: Aviso[];
  onNuevoAviso: (aviso: Aviso) => void;
}) {
  const [avisos, setAvisos] = useState(avisosIniciales);
  const [abierto, setAbierto] = useState(false);
  const [permiso, setPermiso] = useState<NotificationPermission | "no-soportado">("default");
  const vistosRef = useRef<Set<number>>(new Set(avisosIniciales.map((a) => a.id)));

  useEffect(() => {
    if (typeof Notification === "undefined") {
      setPermiso("no-soportado");
    } else {
      setPermiso(Notification.permission);
    }
  }, []);

  useEffect(() => {
    const intervalo = setInterval(async () => {
      const frescos = await obtenerAvisosBodega();
      const nuevos = frescos.filter((a) => !vistosRef.current.has(a.id));

      if (nuevos.length > 0) {
        for (const aviso of nuevos) {
          vistosRef.current.add(aviso.id);
          onNuevoAviso(aviso);
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            new Notification("Improfor · Bodega", { body: aviso.mensaje, tag: `aviso-${aviso.id}` });
          }
        }
      }
      setAvisos(frescos);
    }, INTERVALO_MS);

    return () => clearInterval(intervalo);
  }, [onNuevoAviso]);

  async function pedirPermiso() {
    if (typeof Notification === "undefined") return;
    const resultado = await Notification.requestPermission();
    setPermiso(resultado);
  }

  return (
    <div className="avisos-bell-wrap">
      <button className="avisos-bell" onClick={() => setAbierto((v) => !v)} aria-label="Avisos">
        🔔
        {avisos.length > 0 && <span className="avisos-burbuja">{avisos.length > 9 ? "9+" : avisos.length}</span>}
      </button>

      {abierto && (
        <div className="avisos-dropdown">
          <div className="avisos-dropdown-head">
            <span>Avisos de Bodega</span>
            {avisos.length > 0 && (
              <button
                className="link-btn"
                onClick={async () => {
                  await marcarTodosAvisosLeidos();
                  setAvisos([]);
                }}
              >
                Marcar todos leídos
              </button>
            )}
          </div>

          {permiso !== "granted" && permiso !== "no-soportado" && (
            <button className="avisos-permiso-btn" onClick={pedirPermiso}>
              🔔 Activar notificaciones en este dispositivo
            </button>
          )}

          <div className="avisos-lista">
            {avisos.length === 0 && <p className="recordatorios-vacio">Sin avisos pendientes.</p>}
            {avisos.map((a) => (
              <div key={a.id} className="aviso-item">
                <p>{a.mensaje}</p>
                <div className="recordatorio-meta">
                  <span>{new Date(a.creadoEn).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}</span>
                  <button
                    className="link-btn"
                    onClick={async () => {
                      await marcarAvisoLeido(a.id);
                      setAvisos((prev) => prev.filter((x) => x.id !== a.id));
                    }}
                  >
                    Leído
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
