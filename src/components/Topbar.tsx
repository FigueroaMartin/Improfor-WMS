"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { Rol } from "@/lib/perfil";
import { cerrarPerfil } from "@/app/actions";

const AREAS = [
  { href: "/despacho", label: "Despacho", icono: "🚚", roles: ["despacho"] },
  { href: "/bodega", label: "Bodega", icono: "📦", roles: ["bodega"] },
  { href: "/cobranzas", label: "Cobranzas", icono: "💰", roles: ["cobranzas"] },
  { href: "/compras", label: "Compras", icono: "🛒", roles: ["compras"] },
  { href: "/clientes", label: "Maestro de Clientes", icono: "👥", roles: ["clientes"] },
  { href: "/vendedores", label: "Vendedores/Admin", icono: "📊", roles: ["vendedor", "admin"] },
  { href: "/finanzas", label: "Finanzas", icono: "🏦", roles: ["finanzas", "admin"] },
];

const COOKIE_COLAPSADA = "improfor_sidebar_colapsada";

export default function Topbar({
  area,
  personaNombre,
  personaInicial,
  colorVar,
  rol,
  centro,
}: {
  area: string;
  personaNombre: string;
  personaInicial: string;
  colorVar: string;
  rol: Rol;
  // Slot opcional para un sub-tab de área (ej. Ingreso de pedidos /
  // Pedidos despachados, en Despacho) — se renderiza en la barra de
  // contenido, a la derecha de la barra lateral.
  centro?: ReactNode;
}) {
  const pathname = usePathname();
  // Cada perfil solo ve el link de su propia área — admin las ve todas.
  const areasVisibles = rol === "admin" ? AREAS : AREAS.filter((a) => a.roles.includes(rol));

  // Arranca abierta por defecto — se recuerda en localStorage (por
  // dispositivo/navegador, no por usuario) una vez que la persona la oculta.
  const [colapsada, setColapsada] = useState(false);
  useEffect(() => {
    const guardado = localStorage.getItem(COOKIE_COLAPSADA);
    // Sin preferencia guardada: en celular arranca cerrada (es un drawer que
    // taparía toda la pantalla si abriera solo); en escritorio, abierta.
    const colapsar = guardado != null ? guardado === "1" : window.innerWidth <= 720;
    if (colapsar) {
      setColapsada(true);
      document.documentElement.classList.add("sidebar-colapsada");
    }
  }, []);
  function alternar() {
    setColapsada((v) => {
      const next = !v;
      localStorage.setItem(COOKIE_COLAPSADA, next ? "1" : "0");
      document.documentElement.classList.toggle("sidebar-colapsada", next);
      return next;
    });
  }

  return (
    <>
      <div className="mock-banner">🧪 Fase 2 — datos reales en SQLite (Prisma), sin conexión a Laudus todavía</div>
      <aside className={"sidebar" + (colapsada ? " colapsada" : "")}>
        <div className="sidebar-header">
          <h1>Improfor</h1>
          <button className="sidebar-toggle" onClick={alternar} aria-label="Ocultar barra lateral" title="Ocultar barra lateral">
            ‹
          </button>
        </div>
        {areasVisibles.length > 1 && (
          <nav className="sidebar-nav">
            {areasVisibles.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className={pathname.startsWith(a.href) ? "active" : ""}
                title={a.label}
              >
                <span className="sidebar-nav-icono">{a.icono}</span>
                <span className="sidebar-nav-label">{a.label}</span>
              </Link>
            ))}
          </nav>
        )}
        {centro && <div className="sidebar-centro">{centro}</div>}
        <form action={cerrarPerfil} className="sidebar-persona">
          <button type="submit" className="persona-btn" title="Cambiar de perfil">
            <span className="avatar" style={{ background: `var(${colorVar}-tint)`, color: `var(${colorVar})` }}>
              {personaInicial}
            </span>
            <span className="sidebar-nav-label">{personaNombre}</span>
          </button>
        </form>
      </aside>
      {colapsada && (
        <button className="sidebar-reabrir" onClick={alternar} aria-label="Mostrar barra lateral" title="Mostrar barra lateral">
          ›
        </button>
      )}
      {!colapsada && <div className="sidebar-overlay" onClick={alternar} />}
      <header className="topbar-contenido">
        <span className="area">{area}</span>
      </header>
    </>
  );
}
