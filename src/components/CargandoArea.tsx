// Spinner de carga con mensaje y color propios de cada área — se usa desde
// el loading.tsx de cada carpeta de ruta, que Next.js muestra solo
// mientras esa página trae sus datos reales (consulta a Supabase).
export default function CargandoArea({ texto, colorVar = "--teal" }: { texto: string; colorVar?: string }) {
  return (
    <div className="pagina-cargando">
      <div className="spinner" style={{ borderTopColor: `var(${colorVar})` }} />
      <span className="pagina-cargando-texto">{texto}</span>
    </div>
  );
}
