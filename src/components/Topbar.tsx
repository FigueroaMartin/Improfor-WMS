import Link from "next/link";
import type { ReactNode } from "react";
import type { Rol } from "@/lib/perfil";
import { cerrarPerfil } from "@/app/actions";

const AREAS = [
  { href: "/despacho", label: "Despacho", roles: ["despacho"] },
  { href: "/bodega", label: "Bodega", roles: ["bodega"] },
  { href: "/cobranzas", label: "Cobranzas", roles: ["cobranzas"] },
  { href: "/compras", label: "Compras", roles: ["compras"] },
  { href: "/clientes", label: "Maestro de Clientes", roles: ["clientes"] },
  { href: "/vendedores", label: "Vendedores/Admin", roles: ["vendedor", "admin"] },
  { href: "/finanzas", label: "Finanzas", roles: ["finanzas", "admin"] },
];

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
  // Pedidos despachados, en Despacho) — se renderiza centrado en la misma
  // barra, entre la marca y el perfil.
  centro?: ReactNode;
}) {
  // Cada perfil solo ve el link de su propia área — admin las ve todas.
  const areasVisibles = rol === "admin" ? AREAS : AREAS.filter((a) => a.roles.includes(rol));

  return (
    <>
      <div className="mock-banner">🧪 Fase 2 — datos reales en SQLite (Prisma), sin conexión a Laudus todavía</div>
      <header className="topbar">
        <div className="brand">
          <h1>Improfor</h1>
          <span className="area">{area}</span>
          {areasVisibles.length > 1 && (
            <nav className="area-nav">
              {areasVisibles.map((a) => (
                <Link key={a.href} href={a.href} className={a.label === area || area.startsWith(a.label) ? "active" : ""}>
                  {a.label}
                </Link>
              ))}
            </nav>
          )}
        </div>
        {centro && <div className="topbar-centro">{centro}</div>}
        <form action={cerrarPerfil} className="persona">
          <button type="submit" className="persona-btn" title="Cambiar de perfil">
            <span className="avatar" style={{ background: `var(${colorVar}-tint)`, color: `var(${colorVar})` }}>
              {personaInicial}
            </span>
            {personaNombre}
          </button>
        </form>
      </header>
    </>
  );
}
