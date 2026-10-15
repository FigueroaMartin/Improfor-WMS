"use client";

import { useRef, useState } from "react";
import { cerrarDespacho, generarEtiquetaStarken, type DatosCierre } from "./actions";
import { MOTIVOS_DESPACHO_INCOMPLETO } from "@/lib/dominio";
import { imprimirCaratulas } from "@/lib/caratula";

// Achica la foto antes de guardarla (una foto de celular puede pesar varios
// MB; para el bulto basta con ~1000px de ancho). Devuelve un dataURL JPEG.
function achicarImagen(file: File, maxAncho = 1000, calidad = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("No se pudo leer la imagen"));
      img.onload = () => {
        const escala = Math.min(1, maxAncho / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = img.width * escala;
        canvas.height = img.height * escala;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas no disponible"));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", calidad));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// Abre el diálogo de impresión del navegador apenas llega el PDF de la
// etiqueta — un iframe oculto en vez de una pestaña nueva, para que no
// choque con bloqueadores de pop-ups y no deje una pestaña extra abierta.
function imprimirPdfBase64(base64: string) {
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([arr], { type: "application/pdf" }));

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.src = url;
  iframe.onload = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  };
  document.body.appendChild(iframe);
}

// otYaCargada: la OT de Sendu que Luisana debería haber cargado al
// clasificar el ingreso. Si llegó, Bodega solo la confirma — y como esa OT
// ya implica que Sendu generó la etiqueta con sus propias medidas, tampoco
// hace falta pedir medidas/peso acá. Si por algún motivo falta, Starken
// (Sendu) se comporta como Starken normal — Bodega genera una OT nueva con
// el botón "Generar etiqueta", que sí necesita medidas/peso.
function requisitosPorModo(modo: string, otYaCargada: boolean) {
  const m = modo.toLowerCase();
  if (m.includes("starken(sendu)") || m.includes("starken (sendu)")) {
    return { caratulaYBultos: true, medidas: !otYaCargada, ot: true, firma: false, etiqueta: !otYaCargada, fotoLabel: "Foto del bulto", label: "Starken(Sendu)" };
  }
  if (m.includes("starken")) return { caratulaYBultos: true, medidas: true, ot: true, firma: false, etiqueta: true, fotoLabel: "Foto del bulto", label: "Starken" };
  if (m.includes("robinson")) return { caratulaYBultos: true, medidas: false, ot: false, firma: true, etiqueta: false, fotoLabel: "Foto del bulto", label: "Robinson" };
  // Cliente retira: el producto sale en su empaque original (sin carátula
  // ni conteo de bultos) — solo queda el voucher/factura·boleta firmado
  // como respaldo de la entrega.
  if (m.includes("cliente retira")) return { caratulaYBultos: false, medidas: false, ot: false, firma: false, etiqueta: false, fotoLabel: "Foto factura/boleta", label: "Cliente retira" };
  return { caratulaYBultos: true, medidas: false, ot: false, firma: false, etiqueta: false, fotoLabel: "Foto del bulto", label: modo };
}

export default function CierreDespacho({
  pedidoId,
  modoDespacho,
  contacto,
  cliente,
  oc,
  documento,
  facturaNumero,
  otExistente,
  direccionExistente,
  comunaExistente,
  telefonoExistente,
  onCerrado,
  onVolver,
}: {
  pedidoId: string;
  modoDespacho: string;
  contacto: string;
  cliente: string;
  oc?: string | null;
  documento: string;
  facturaNumero?: string | null;
  otExistente?: string | null;
  // Dirección/comuna/teléfono del destinatario vienen con el pedido
  // (desde Laudus) — Bodega solo los usa para la etiqueta, no los escribe.
  direccionExistente?: string | null;
  comunaExistente?: string | null;
  telefonoExistente?: string | null;
  onCerrado: (historialId: number) => void;
  onVolver: () => void;
}) {
  const req = requisitosPorModo(modoDespacho, !!otExistente);
  const [caratula, setCaratula] = useState<"P" | "M" | "G" | "">("");
  const [bultos, setBultos] = useState("1");
  const [foto, setFoto] = useState<string | null>(null);
  const [tomandoFoto, setTomandoFoto] = useState(false);

  // Medidas por separado (lo que en realidad pide la API de una naviera/
  // courier) en vez de un solo texto libre.
  const [largo, setLargo] = useState("");
  const [ancho, setAncho] = useState("");
  const [alto, setAlto] = useState("");
  const [peso, setPeso] = useState("");

  // Starken(Sendu): la OT ya la cargó Luisana al clasificar el ingreso —
  // acá solo se confirma, no se vuelve a pedir.
  const [ot, setOt] = useState(otExistente ?? "");
  const [firma, setFirma] = useState(false);

  // Datos para la etiqueta Starken. El nombre del destinatario ya lo
  // tenemos del pedido (contacto) — el resto hoy se escribe a mano porque
  // no hay integración con Laudus todavía.
  const [direccionEntrega, setDireccionEntrega] = useState(direccionExistente ?? "");
  const [comuna, setComuna] = useState(comunaExistente ?? "");
  const [telefonoContacto, setTelefonoContacto] = useState(telefonoExistente ?? "");
  const [numeroGuiaStarken, setNumeroGuiaStarken] = useState<string | null>(null);
  const [generandoEtiqueta, setGenerandoEtiqueta] = useState(false);
  const [errorEtiqueta, setErrorEtiqueta] = useState<string | null>(null);

  // Si el pedido ya trae estos datos (de Laudus), se muestran de solo
  // lectura — Bodega no debería tener que escribirlos. Si faltaran (ej.
  // todavía no hay integración real), se habilita el campo como respaldo.
  const datosEnvioConocidos = !!(direccionExistente && comunaExistente && telefonoExistente);

  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // §5g.1 — si el cierre viene corto (preparado < pedido) habiendo stock
  // para completarlo, el server no cierra: exige elegir un motivo antes.
  const [incompleto, setIncompleto] = useState<{
    productos: { id: number; nombre: string; cantidad: number; preparado: number; stock: number }[];
  } | null>(null);
  const [motivoIncompleto, setMotivoIncompleto] = useState(MOTIVOS_DESPACHO_INCOMPLETO[0]);

  const medidasCompletas = req.medidas ? !!(largo.trim() && ancho.trim() && alto.trim() && peso.trim()) : true;
  const etiquetaLista = req.etiqueta ? !!numeroGuiaStarken : true;

  // Candado del lado del cliente (la validación real y definitiva vive en
  // el server action — esto solo evita el viaje de ida y vuelta obvio).
  const listo =
    (!req.caratulaYBultos || (!!caratula && Number(bultos) >= 1)) &&
    !!foto &&
    medidasCompletas &&
    (!req.ot || ot.trim()) &&
    (!req.firma || firma) &&
    etiquetaLista;

  async function onArchivoFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo si repite
    if (!file) return;
    setTomandoFoto(true);
    setError(null);
    try {
      const dataUrl = await achicarImagen(file);
      setFoto(dataUrl);
    } catch {
      setError("No se pudo procesar la foto. Intenta de nuevo.");
    } finally {
      setTomandoFoto(false);
    }
  }

  async function onGenerarEtiqueta() {
    setGenerandoEtiqueta(true);
    setErrorEtiqueta(null);
    const res = await generarEtiquetaStarken(pedidoId, {
      nombreDestinatario: contacto,
      direccionEntrega,
      comuna,
      telefonoContacto,
      largo: Number(largo),
      ancho: Number(ancho),
      alto: Number(alto),
      peso: Number(peso),
    });
    setGenerandoEtiqueta(false);
    if (!res.ok || !res.numeroGuiaStarken) {
      setErrorEtiqueta(res.error ?? "No se pudo generar la etiqueta.");
      return;
    }
    setNumeroGuiaStarken(res.numeroGuiaStarken);
    setOt(res.numeroGuiaStarken);
    if (res.etiquetaPdfBase64) {
      imprimirPdfBase64(res.etiquetaPdfBase64);
    } else if (res.avisoEtiqueta) {
      // La OF se creó bien (ya tenemos la OT) pero la etiqueta no se pudo
      // traer ahora — se puede reintentar más tarde desde el N° de guía.
      setErrorEtiqueta(`OT generada (${res.numeroGuiaStarken}), pero la etiqueta no se pudo imprimir: ${res.avisoEtiqueta}`);
    }
  }

  async function confirmar(motivoParaIncompleto?: string) {
    setEnviando(true);
    setError(null);
    const datos: DatosCierre = {
      caratula: req.caratulaYBultos ? caratula : undefined,
      bultos: req.caratulaYBultos ? Number(bultos) : undefined,
      fotoDataUrl: foto ?? undefined,
      medidas: req.medidas ? `${largo}x${ancho}x${alto}` : undefined,
      peso: peso ? Number(peso) : undefined,
      otNumero: ot || undefined,
      firmaCapturada: firma,
      direccionEntrega: direccionEntrega || undefined,
      comuna: comuna || undefined,
      telefonoContacto: telefonoContacto || undefined,
      numeroGuiaStarken: numeroGuiaStarken ?? undefined,
      motivoIncompleto: motivoParaIncompleto,
    };
    const res = await cerrarDespacho(pedidoId, datos);
    setEnviando(false);
    if ((res as any).requiereMotivoIncompleto) {
      setIncompleto({ productos: (res as any).productos });
      return;
    }
    if (!res.ok || res.historialId == null) {
      setError(res.error ?? "No se pudo cerrar el despacho.");
      return;
    }
    if (req.caratulaYBultos) {
      imprimirCaratulas({
        cantidadCajas: Number(bultos) || 1,
        tamano: caratula === "P" ? "pequeno" : caratula === "G" ? "grande" : "mediano",
        docTipo: documento,
        docNumero: ot || numeroGuiaStarken || facturaNumero || null,
        cliente,
        direccion: direccionEntrega || undefined,
        comuna: comuna || undefined,
        transportista: req.label,
        contacto,
        telefonoContacto: telefonoContacto || undefined,
        oc,
      });
    }
    onCerrado(res.historialId);
  }

  return (
    <>
      <h2>Cerrar despacho</h2>
      <div className="sub">Modo: {req.label} · {pedidoId}</div>

      {req.caratulaYBultos && (
        <>
          <div className="field" style={{ marginBottom: 14 }}>
            <div className="label">① Tamaño de carátula</div>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              {(["P", "M", "G"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={caratula === t ? "caratula-sel" : "btn-secundario"}
                  style={{ padding: "8px 16px" }}
                  onClick={() => setCaratula(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="field" style={{ marginBottom: 14 }}>
            <div className="label">② Bultos</div>
            <input
              type="number"
              min={1}
              className="motivo-select"
              value={bultos}
              onChange={(e) => setBultos(e.target.value)}
            />
          </div>
        </>
      )}

      <div className="field" style={{ marginBottom: 14 }}>
        <div className="label">{req.fotoLabel} (obligatoria — candado de cierre)</div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onArchivoFoto}
          style={{ display: "none" }}
        />
        {foto ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
            <img
              src={foto}
              alt={req.fotoLabel}
              style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line)" }}
            />
            <button type="button" className="btn-secundario" onClick={() => fileInputRef.current?.click()}>
              📷 Repetir foto
            </button>
            <span style={{ color: "var(--teal)", fontSize: 12.5, fontWeight: 700 }}>✓ Foto lista</span>
          </div>
        ) : (
          <button
            type="button"
            className="btn-secundario"
            style={{ marginTop: 6 }}
            onClick={() => fileInputRef.current?.click()}
            disabled={tomandoFoto}
          >
            {tomandoFoto ? "Procesando…" : "📷 Sacar foto"}
          </button>
        )}
      </div>

      {req.medidas && (
        <div className="row" style={{ marginBottom: 14, flexWrap: "wrap" }}>
          <div className="field" style={{ minWidth: 70 }}>
            <div className="label">Largo (cm)</div>
            <input type="number" className="motivo-select" value={largo} onChange={(e) => setLargo(e.target.value)} disabled={!!numeroGuiaStarken} />
          </div>
          <div className="field" style={{ minWidth: 70 }}>
            <div className="label">Ancho (cm)</div>
            <input type="number" className="motivo-select" value={ancho} onChange={(e) => setAncho(e.target.value)} disabled={!!numeroGuiaStarken} />
          </div>
          <div className="field" style={{ minWidth: 70 }}>
            <div className="label">Alto (cm)</div>
            <input type="number" className="motivo-select" value={alto} onChange={(e) => setAlto(e.target.value)} disabled={!!numeroGuiaStarken} />
          </div>
          <div className="field" style={{ minWidth: 90 }}>
            <div className="label">Peso (kg)</div>
            <input type="number" className="motivo-select" value={peso} onChange={(e) => setPeso(e.target.value)} disabled={!!numeroGuiaStarken} />
          </div>
        </div>
      )}

      {req.etiqueta && (
        <div className="field" style={{ marginBottom: 14, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8, padding: 12 }}>
          <div className="label" style={{ marginBottom: 8 }}>
            ④ Datos para la etiqueta {req.label}
          </div>
          {req.label === "Starken(Sendu)" && (
            <p style={{ fontSize: 11, color: "var(--amber)", marginBottom: 8 }}>
              ⚠ No llegó la OT desde Despacho — genera una acá como respaldo y avísale a Luisana.
            </p>
          )}

          <div className="row" style={{ marginBottom: 10 }}>
            <div className="field">
              <div className="label">Destinatario</div>
              <div className="value" style={{ fontSize: 13.5 }}>{contacto}</div>
            </div>
          </div>

          {datosEnvioConocidos ? (
            <div className="row" style={{ marginBottom: 10, flexWrap: "wrap" }}>
              <div className="field">
                <div className="label">Dirección de entrega</div>
                <div className="value" style={{ fontSize: 13.5 }}>{direccionEntrega}</div>
              </div>
              <div className="field">
                <div className="label">Comuna</div>
                <div className="value" style={{ fontSize: 13.5 }}>{comuna}</div>
              </div>
              <div className="field">
                <div className="label">Teléfono de contacto</div>
                <div className="value" style={{ fontSize: 13.5 }}>{telefonoContacto}</div>
              </div>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 11, color: "var(--amber)", marginBottom: 8 }}>
                ⚠ No llegaron estos datos con el pedido — complétalos a mano como respaldo.
              </p>
              <div className="field" style={{ marginBottom: 10 }}>
                <div className="label">Dirección de entrega</div>
                <input
                  className="motivo-select"
                  placeholder="Calle, número, depto/oficina"
                  value={direccionEntrega}
                  onChange={(e) => setDireccionEntrega(e.target.value)}
                  disabled={!!numeroGuiaStarken}
                />
              </div>

              <div className="row" style={{ marginBottom: 10 }}>
                <div className="field">
                  <div className="label">Comuna</div>
                  <input className="motivo-select" value={comuna} onChange={(e) => setComuna(e.target.value)} disabled={!!numeroGuiaStarken} />
                </div>
                <div className="field">
                  <div className="label">Teléfono de contacto</div>
                  <input className="motivo-select" value={telefonoContacto} onChange={(e) => setTelefonoContacto(e.target.value)} disabled={!!numeroGuiaStarken} />
                </div>
              </div>
            </>
          )}

          {numeroGuiaStarken ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="badge stock_ok">✓ Etiqueta generada</span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>N° guía {numeroGuiaStarken}</span>
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  setNumeroGuiaStarken(null);
                  setOt("");
                }}
              >
                Editar datos
              </button>
            </div>
          ) : (
            <button type="button" className="btn-secundario" onClick={onGenerarEtiqueta} disabled={generandoEtiqueta}>
              {generandoEtiqueta ? "Generando…" : "🏷️ Generar etiqueta (Starken)"}
            </button>
          )}
          {errorEtiqueta && <p style={{ color: "var(--red)", fontSize: 12, marginTop: 6 }}>{errorEtiqueta}</p>}
        </div>
      )}

      {req.ot && !req.etiqueta && (
        // Solo se llega acá cuando otExistente ya vino cargado desde
        // Despacho (si faltara, req.etiqueta sería true y se usa el botón
        // "Generar etiqueta" de más abajo como respaldo).
        <div className="field" style={{ marginBottom: 14 }}>
          <div className="label">④ N° de OT (Sendu)</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="badge stock_ok">✓ {ot}</span>
            <span style={{ fontSize: 11, color: "var(--ink-soft)" }}>Cargada por Luisana al clasificar el ingreso.</span>
          </div>
        </div>
      )}

      {req.firma && (
        <div className="field" style={{ marginBottom: 14 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, cursor: "pointer" }}>
            <input type="checkbox" checked={firma} onChange={(e) => setFirma(e.target.checked)} />
            ✍️ Firma de recepción capturada (Robinson)
          </label>
        </div>
      )}

      {incompleto && (
        <div className="field" style={{ marginBottom: 14, background: "var(--red-tint)", border: "1px solid var(--red)", borderRadius: 8, padding: 12 }}>
          <div className="label" style={{ marginBottom: 8 }}>
            ⚠ Preparaste menos de lo pedido, y hay stock para completarlo
          </div>
          <table className="productos">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Pedido</th>
                <th>Preparado</th>
                <th>Stock</th>
              </tr>
            </thead>
            <tbody>
              {incompleto.productos.map((p) => (
                <tr key={p.id}>
                  <td>{p.nombre}</td>
                  <td>{p.cantidad}</td>
                  <td>{p.preparado}</td>
                  <td>{p.stock}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="field" style={{ margin: "10px 0" }}>
            <div className="label">Motivo (obligatorio para despachar incompleto)</div>
            <select className="motivo-select" value={motivoIncompleto} onChange={(e) => setMotivoIncompleto(e.target.value)}>
              {MOTIVOS_DESPACHO_INCOMPLETO.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" className="btn-secundario" onClick={() => setIncompleto(null)}>
              ‹ Volver a completar
            </button>
            <button type="button" onClick={() => { setIncompleto(null); confirmar(motivoIncompleto); }}>
              Despachar incompleto con motivo
            </button>
          </div>
        </div>
      )}

      {error && (
        <p style={{ color: "var(--red)", fontSize: 12.5, marginBottom: 10 }}>{error}</p>
      )}

      <div className="guardar-cerrar">
        <button className="btn-secundario" onClick={onVolver} disabled={enviando}>
          ‹ Atrás
        </button>
        <button className={listo ? "" : "btn-secundario"} disabled={!listo || enviando} onClick={() => confirmar()}>
          {enviando ? "Cerrando…" : "🔒 Cerrar despacho"}
        </button>
      </div>
    </>
  );
}
