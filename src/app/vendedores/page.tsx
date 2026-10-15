import { prisma } from "@/lib/prisma";
import { calcColumnaVendedor } from "@/lib/dominio";
import { requireRol } from "@/lib/perfil";
import VendedorBoard from "./VendedorBoard";
import Topbar from "@/components/Topbar";
import { obtenerTransportistas, obtenerProveedores, obtenerProductosMaestro } from "@/app/compras/actions";
import { obtenerVendedoresMaestro } from "./actions";

export const dynamic = "force-dynamic";

export default async function VendedoresPage() {
  const perfil = await requireRol("vendedor");

  const pedidos = await prisma.pedido.findMany({
    where: { columnaDespacho: { not: "eliminado" } },
    include: { productos: true },
    orderBy: { creadoEn: "asc" },
  });

  const items = pedidos
    .map((p) => ({ ...p, columnaVendedor: calcColumnaVendedor(p) }))
    .filter((p): p is typeof p & { columnaVendedor: string } => p.columnaVendedor !== null);

  // Cada vendedor ve solo los suyos; Administrador ve todos y filtra por
  // vendedor desde el tablero.
  const vendedores = [...new Set(items.map((p) => p.vendedor))].sort();
  const esAdmin = perfil.rol === "admin";
  const itemsVisibles = esAdmin ? items : items.filter((p) => p.vendedor === perfil.nombre);

  // Administrador — Pendientes de pago (solo lectura; el pago lo confirma
  // Cobranzas). No depende de columnaVendedor porque un pedido pendiente de
  // pago puede seguir en cualquier etapa de despacho.
  const pendientesPago = pedidos.filter((p) => p.situacionCobro === "Pendiente de pago" && p.columnaDespacho !== "eliminado");

  // Hub de maestros (Admin_Maestros) — conteos reales de los maestros
  // propios del sistema; solo se consultan si el tab de Administración es
  // visible para este rol.
  const [transportistas, proveedores, productosMaestro, vendedoresMaestro] = esAdmin
    ? await Promise.all([obtenerTransportistas(), obtenerProveedores(), obtenerProductosMaestro(), obtenerVendedoresMaestro()])
    : [[], [], [], []];

  return (
    <>
      <Topbar area="Vendedores/Admin" personaNombre={perfil.nombre} personaInicial={perfil.inicial} colorVar="--amber" rol={perfil.rol} />
      <VendedorBoard
        items={itemsVisibles}
        vendedores={vendedores}
        esAdmin={esAdmin}
        pendientesPago={esAdmin ? pendientesPago : []}
        conteoTransportistas={transportistas.length}
        conteoProveedores={proveedores.length}
        conteoProductos={productosMaestro.length}
        vendedoresMaestro={vendedoresMaestro}
      />
    </>
  );
}
