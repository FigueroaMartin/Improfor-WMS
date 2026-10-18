import CargandoArea from "@/components/CargandoArea";

// Red de seguridad para cualquier ruta sin su propio loading.tsx — cada
// área ya tiene el suyo con mensaje y color propios.
export default function Loading() {
  return <CargandoArea texto="Cargando…" />;
}
