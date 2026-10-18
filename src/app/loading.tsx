// Se muestra solo mientras la página destino está cargando sus datos
// (primera entrada a una página, o router.refresh() tras una acción) — sin
// esto la pantalla anterior queda congelada ese rato, que con la base de
// datos en otra región se nota. Next.js la usa automáticamente, no hay que
// llamarla a mano.
export default function Loading() {
  return (
    <div className="pagina-cargando">
      <div className="spinner" />
      <span className="pagina-cargando-texto">Cargando…</span>
    </div>
  );
}
