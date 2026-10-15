// Perfiles — Fase 2. No es autenticación real (sin contraseña): es un
// selector de "quién está usando el dispositivo ahora" con una cookie,
// pensado para tablets/celulares compartidos en bodega/despacho. El día
// que haya login de verdad, este archivo es el único que cambia.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const COOKIE_PERFIL = "improfor_perfil";

// Interruptor de "fase de testing" — cuando está apagado (por defecto), el
// selector de perfil funciona como siempre (clic y listo, sin clave) para
// no tener que loguearse a cada rato mientras se prueba. Cuando se activa,
// elegirPerfil() exige la clave de cada perfil (ver abajo). Vive en una
// cookie propia, separada de la sesión del perfil.
export const COOKIE_LOGIN_ON = "improfor_login_on";

// clave: contraseña en texto plano SOLO para esta fase de pruebas (sin
// hash, sin usuarios reales) — se usa nada más cuando COOKIE_LOGIN_ON está
// activo. El día que haya login de verdad, este archivo es el único que
// cambia.
//
// fase1: true → perfil que entra en la primera entrega (Despacho, Bodega,
// Cobranzas, Compras, Robinson). El selector de perfil puede ocultar el
// resto mientras esas áreas no estén listas para mostrarse todavía.
export const PERFILES = [
  { rol: "despacho", nombre: "Luisana", clave: "despacho123", inicial: "L", colorVar: "--teal", home: "/despacho", area: "Despacho", fase1: true },
  { rol: "bodega", nombre: "Fernando", clave: "bodega123", inicial: "F", colorVar: "--blue", home: "/bodega", area: "Bodega", fase1: true },
  { rol: "cobranzas", nombre: "María José", clave: "cobranzas123", inicial: "M", colorVar: "--red", home: "/cobranzas", area: "Cobranzas", fase1: true },
  { rol: "compras", nombre: "Marcela", clave: "compras123", inicial: "M", colorVar: "--purple", home: "/compras", area: "Compras", fase1: true },
  { rol: "clientes", nombre: "Maestro", clave: "clientes123", inicial: "M", colorVar: "--amber", home: "/clientes", area: "Maestro de Clientes", fase1: true },
  { rol: "vendedor", nombre: "Ana Silva", clave: "vendedor123", inicial: "A", colorVar: "--amber", home: "/vendedores", area: "Vendedores/Admin", fase1: false },
  { rol: "finanzas", nombre: "Francisca", clave: "finanzas123", inicial: "F", colorVar: "--blue", home: "/finanzas", area: "Gerencia Finanzas", fase1: false },
  { rol: "admin", nombre: "Alex", clave: "admin123", inicial: "A", colorVar: "--ink", home: "/despacho", area: "Administración (todas las áreas)", fase1: false },
  // Sin atribuciones todavía — existe el perfil pero no tiene ninguna
  // pantalla asignada. Corresponde al futuro Robinson_App_Entrega del
  // documento (login externo, solo sus entregas) — se arma más adelante.
  { rol: "robinson", nombre: "Robinson", clave: "robinson123", inicial: "R", colorVar: "--ink", home: "/repartos", area: "Repartos (sin permisos aún)", fase1: true },
] as const;

export type Rol = (typeof PERFILES)[number]["rol"];

export function perfilPorRol(rol: string) {
  return PERFILES.find((p) => p.rol === rol);
}

export async function loginRequerido() {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_LOGIN_ON)?.value === "1";
}

// Cada página de área llama esto al principio. Si no hay perfil elegido,
// manda a la pantalla de selección; si el perfil es de otra área, lo manda
// a SU área en vez de dejarlo entrar (admin entra a todas).
export async function requireRol(rolEsperado: Rol) {
  const cookieStore = await cookies();
  const rol = cookieStore.get(COOKIE_PERFIL)?.value;
  const perfil = rol ? perfilPorRol(rol) : undefined;

  if (!perfil) redirect("/");
  if (perfil.rol !== rolEsperado && perfil.rol !== "admin") redirect(perfil.home);

  return perfil;
}
