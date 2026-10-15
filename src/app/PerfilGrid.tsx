"use client";

import { useEffect, useState } from "react";
import { elegirPerfil, setLoginRequerido } from "./actions";
import type { PERFILES } from "@/lib/perfil";

const CLAVE_STORAGE = "improfor_mostrar_todos_perfiles";

// Toggle para la entrega de la primera fase — por defecto solo se ven los
// perfiles de Despacho/Bodega/Cobranzas/Compras/Robinson; el resto
// (Vendedores, Gerencia Finanzas, Administración) queda oculto hasta que
// esas áreas estén listas para mostrarse. Preferencia solo de quien mira
// la pantalla (se guarda en el navegador, no afecta a nadie más).
export default function PerfilGrid({ perfiles, loginOnInicial }: { perfiles: typeof PERFILES; loginOnInicial: boolean }) {
  const [mostrarTodos, setMostrarTodos] = useState(false);
  const [loginOn, setLoginOn] = useState(loginOnInicial);
  const [cambiandoLogin, setCambiandoLogin] = useState(false);
  const [mostrarCredenciales, setMostrarCredenciales] = useState(false);

  const [rolAbierto, setRolAbierto] = useState<string | null>(null);
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  useEffect(() => {
    const guardado = localStorage.getItem(CLAVE_STORAGE);
    if (guardado != null) setMostrarTodos(guardado === "1");
  }, []);

  function toggleFase1() {
    setMostrarTodos((v) => {
      const next = !v;
      localStorage.setItem(CLAVE_STORAGE, next ? "1" : "0");
      return next;
    });
  }

  async function toggleLogin() {
    setCambiandoLogin(true);
    const next = !loginOn;
    await setLoginRequerido(next);
    setLoginOn(next);
    setRolAbierto(null);
    setClave("");
    setError(null);
    setCambiandoLogin(false);
  }

  async function entrar(rol: string, claveForm?: string) {
    setEntrando(true);
    setError(null);
    const fd = new FormData();
    fd.set("rol", rol);
    if (claveForm) fd.set("clave", claveForm);
    const res = await elegirPerfil(fd);
    // elegirPerfil redirige en éxito (lanza NEXT_REDIRECT) — si volvemos acá
    // con un resultado, es porque falló.
    if (res && res.ok === false) {
      setError(res.error ?? "No se pudo entrar.");
      setEntrando(false);
    }
  }

  function onClickPerfil(rol: string) {
    if (!loginOn) {
      entrar(rol);
      return;
    }
    setRolAbierto(rol);
    setClave("");
    setError(null);
  }

  const visibles = mostrarTodos ? perfiles : perfiles.filter((p) => p.fase1);

  return (
    <div className="perfil-picker-wrap">
      <div className="perfil-picker-toggle" style={{ gap: 10, flexWrap: "wrap" }}>
        <button type="button" className="link-btn" onClick={toggleFase1}>
          {mostrarTodos ? "Mostrar solo Fase 1 ▴" : "Mostrar todos los perfiles ▾"}
        </button>
        <button type="button" className="link-btn" onClick={toggleLogin} disabled={cambiandoLogin}>
          {loginOn ? "🔓 Desactivar clave (modo prueba)" : "🔒 Activar clave (como sería en producción)"}
        </button>
      </div>

      <div className="perfil-grid">
        {visibles.map((p) => (
          <div key={p.rol} className="perfil-card-wrap">
            <button type="button" className="perfil-card" onClick={() => onClickPerfil(p.rol)}>
              <span className="perfil-avatar" style={{ background: `var(${p.colorVar}-tint)`, color: `var(${p.colorVar})` }}>
                {p.inicial}
              </span>
              <span className="perfil-nombre">{p.nombre}</span>
              <span className="perfil-area">{p.area}</span>
            </button>

            {rolAbierto === p.rol && (
              <form
                className="perfil-clave-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  entrar(p.rol, clave);
                }}
              >
                <input
                  type="password"
                  className="motivo-select"
                  placeholder="Clave"
                  autoFocus
                  value={clave}
                  onChange={(e) => setClave(e.target.value)}
                />
                <button type="submit" disabled={entrando}>
                  {entrando ? "Entrando…" : "Entrar"}
                </button>
                {error && <p style={{ color: "var(--red)", fontSize: 11.5, margin: "4px 0 0" }}>{error}</p>}
              </form>
            )}
          </div>
        ))}
      </div>

      {loginOn && (
        <aside className="perfil-credenciales">
          <button type="button" className="link-btn" onClick={() => setMostrarCredenciales((v) => !v)}>
            {mostrarCredenciales ? "Ocultar credenciales ▴" : "📋 Ver usuarios y claves (testing) ▾"}
          </button>
          {mostrarCredenciales && (
            <table className="perfil-credenciales-tabla">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Área</th>
                  <th>Clave</th>
                </tr>
              </thead>
              <tbody>
                {perfiles.map((p) => (
                  <tr key={p.rol}>
                    <td>{p.nombre}</td>
                    <td>{p.area}</td>
                    <td><code>{p.clave}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </aside>
      )}
    </div>
  );
}
