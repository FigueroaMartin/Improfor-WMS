"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// Maestro de vendedores (Admin_Maestros) — equipo comercial propio del
// software.

export async function obtenerVendedoresMaestro() {
  return prisma.vendedor.findMany({ orderBy: { nombre: "asc" } });
}

export async function guardarVendedor(nombre: string) {
  if (!nombre.trim()) return { ok: false, error: "Falta el nombre." };
  await prisma.vendedor.upsert({
    where: { nombre },
    create: { nombre },
    update: {},
  });
  revalidatePath("/vendedores");
  return { ok: true };
}

export async function cambiarActivoVendedor(nombre: string, activo: boolean) {
  await prisma.vendedor.update({ where: { nombre }, data: { activo } });
  revalidatePath("/vendedores");
}
