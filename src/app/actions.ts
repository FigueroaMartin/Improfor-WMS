"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_PERFIL, COOKIE_LOGIN_ON, perfilPorRol, loginRequerido } from "@/lib/perfil";

export async function elegirPerfil(formData: FormData) {
  const rol = String(formData.get("rol") ?? "");
  const perfil = perfilPorRol(rol);
  if (!perfil) return { ok: false, error: "Perfil no encontrado." };

  if (await loginRequerido()) {
    const clave = String(formData.get("clave") ?? "");
    if (clave !== perfil.clave) {
      return { ok: false, error: "Clave incorrecta." };
    }
  }

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_PERFIL, rol, {
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    sameSite: "lax",
  });

  redirect(perfil.home);
}

// Toggle de "fase de testing" — ver COOKIE_LOGIN_ON en lib/perfil.ts.
export async function setLoginRequerido(activo: boolean) {
  const cookieStore = await cookies();
  if (activo) {
    cookieStore.set(COOKIE_LOGIN_ON, "1", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  } else {
    cookieStore.delete(COOKIE_LOGIN_ON);
  }
}

export async function cerrarPerfil() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_PERFIL);
  redirect("/");
}
