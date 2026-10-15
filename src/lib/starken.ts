// Integración real con Starken — Web Service Emisión H2H + API REST
// Etiqueta (ambiente QA, ver .env). Dos llamadas:
//   1. crearOrdenFlete()      → crea la OF, devuelve el nroOrdenFlete (OT real).
//   2. obtenerEtiquetaPdf()   → con ese nroOrdenFlete, trae el PDF (base64) para imprimir.
// El día que haya credenciales de producción, solo cambian las variables
// de entorno — este archivo queda igual.

type DatosEnvio = {
  nombreDestinatario: string;
  direccion: string;
  numeracion?: string;
  comuna: string;
  telefono: string;
  kilos: number;
  alto: number;
  ancho: number;
  largo: number;
  contenido: string;
  valorDeclarado: number;
};

export async function crearOrdenFlete(datos: DatosEnvio): Promise<{ ok: boolean; nroOrdenFlete?: string; error?: string }> {
  const body = {
    rutEmpresaEmisora: process.env.STARKEN_RUT_EMPRESA_EMISORA,
    rutUsuarioEmisor: process.env.STARKEN_RUT_USUARIO_EMISOR,
    claveUsuarioEmisor: process.env.STARKEN_CLAVE_USUARIO_EMISOR,
    rutRemitente: process.env.STARKEN_RUT_REMITENTE,
    dvRemitente: process.env.STARKEN_DV_REMITENTE,
    nombreRazonSocialRemitente: process.env.STARKEN_NOMBRE_REMITENTE,
    apellidoPaternoRemitente: ".",
    apellidoMaternoRemitente: ".",
    direccionRemitente: process.env.STARKEN_DIRECCION_REMITENTE,
    numeracionDireccionRemitente: process.env.STARKEN_NUMERACION_REMITENTE,
    departamentoRemitente: "",
    emailRemitente: process.env.STARKEN_EMAIL_REMITENTE,
    telefonoRemitente: process.env.STARKEN_TELEFONO_REMITENTE,
    comunaRemitente: process.env.STARKEN_COMUNA_REMITENTE,
    rutDestinatario: "",
    dvRutDestinatario: "",
    nombreRazonSocialDestinatario: datos.nombreDestinatario,
    // La API exige apellido paterno/materno aunque el destinatario sea
    // tratado como razón social — "." es la misma convención que usa
    // Starken para el remitente en su propio ejemplo documentado.
    apellidoPaternoDestinatario: ".",
    apellidoMaternoDestinatario: ".",
    direccionDestinatario: datos.direccion,
    numeracionDireccionDestinatario: datos.numeracion || "S/N",
    departamentoDireccionDestinatario: "",
    comunaDestino: datos.comuna.toUpperCase(),
    telefonoDestinatario: datos.telefono,
    emailDestinatario: "",
    nombreContactoDestinatario: datos.nombreDestinatario,
    tipoEntrega: 2, // Home — siempre despacho a domicilio en nuestro flujo
    tipoPago: "2", // Cuenta corriente — la cuenta de la empresa, no "pagar en destino"
    numeroCtaCte: process.env.STARKEN_NUMERO_CTA_CTE,
    dvNumeroCtaCte: process.env.STARKEN_DV_CTA_CTE,
    centroCostoCtaCte: process.env.STARKEN_CENTRO_COSTO_CTA_CTE,
    valorDeclarado: String(datos.valorDeclarado),
    contenido: datos.contenido.slice(0, 50),
    kilosTotal: String(datos.kilos),
    alto: String(datos.alto),
    ancho: String(datos.ancho),
    largo: String(datos.largo),
    tipoServicio: "0", // Normal
    tipoEncargo1: "29", // Paquete en kilogramos
    cantidadEncargo1: "1",
    observacion: "Generado desde Improfor",
  };

  let res: Response;
  try {
    res = await fetch(process.env.STARKEN_H2H_URL!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: "No se pudo conectar con Starken. Intenta de nuevo." };
  }

  if (!res.ok) {
    return { ok: false, error: `Starken respondió ${res.status} — revisa las credenciales/ambiente.` };
  }

  const data = await res.json();
  // La API real responde "descripcionError" (minúscula) — la documentación
  // lo muestra como "DescripcionError"; se cubren ambas por si acaso.
  if (data.codigoError && Number(data.codigoError) !== 0) {
    const detalle = data.descripcionError ?? data.DescripcionError ?? "error desconocido";
    return { ok: false, error: `Starken: ${detalle} (código ${data.codigoError})` };
  }

  // nroOrdenFlete viene en notación científica (ej. "2.22746632E8") — hay
  // que normalizarlo a un entero antes de guardarlo como OT.
  const nroOrdenFlete = Math.round(Number(data.nroOrdenFlete)).toString();
  if (!nroOrdenFlete || nroOrdenFlete === "NaN") {
    return { ok: false, error: "Starken no devolvió un N° de Orden de Flete válido." };
  }
  return { ok: true, nroOrdenFlete };
}

export async function obtenerEtiquetaPdfBase64(nroOrdenFlete: string): Promise<{ ok: boolean; pdfBase64?: string; error?: string }> {
  const url = new URL(process.env.STARKEN_ETIQUETA_URL!);
  url.searchParams.set("ordenFlete", nroOrdenFlete);
  url.searchParams.set("tipoSalida", "1"); // 1 = PDF en Base64

  const auth = Buffer.from(`${process.env.STARKEN_ETIQUETA_USER}:${process.env.STARKEN_ETIQUETA_PASS}`).toString("base64");

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: "POST",
      headers: { Authorization: `Basic ${auth}` },
    });
  } catch {
    return { ok: false, error: "No se pudo conectar con el servicio de etiquetas de Starken." };
  }

  if (!res.ok) {
    return { ok: false, error: `El servicio de etiquetas respondió ${res.status}.` };
  }

  // La respuesta real es {"data": ["<base64 del PDF>"]} — un array con un
  // solo elemento. Se cubren además los casos de string plano o objeto
  // simple, por si el ambiente de producción responde distinto.
  const texto = await res.text();
  let pdfBase64 = texto.trim();
  try {
    const json = JSON.parse(texto);
    const data = json.data ?? json.pdf ?? json.etiqueta ?? json;
    pdfBase64 = Array.isArray(data) ? data[0] : data;
  } catch {
    // No era JSON — se asume que el body completo ya es el base64.
  }
  pdfBase64 = String(pdfBase64).replace(/^"|"$/g, "");

  if (!pdfBase64) return { ok: false, error: "Starken no devolvió la etiqueta." };
  return { ok: true, pdfBase64 };
}
