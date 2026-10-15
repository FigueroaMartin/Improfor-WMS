// Generador de carátulas — formato copiado 1:1 del generador real de
// Improfor Web (github.com/FigueroaMartin/Proyecto-Improfor-Web,
// src/screens/CaratulaPedido). Mismo layout de cajas tipo formulario,
// mismos tamaños y mismo remitente fijo; acá se dispara automáticamente al
// cerrar el despacho en Bodega, en vez de necesitar una pantalla aparte.

export type DatosCaratula = {
  cantidadCajas: number;
  tamano: "pequeno" | "mediano" | "grande";
  docTipo: string | null;
  docNumero: string | number | null;
  cliente: string;
  direccion?: string | null;
  comuna?: string | null;
  transportista?: string | null;
  contacto?: string | null;
  telefonoContacto?: string | null;
  oc?: string | null;
};

const TAMANOS: Record<DatosCaratula["tamano"], { width: number; fontSize: number }> = {
  pequeno: { width: 340, fontSize: 12 },
  mediano: { width: 460, fontSize: 16 },
  grande: { width: 640, fontSize: 21 },
};

function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function construirHtmlCaratulas(d: DatosCaratula): string {
  const { width, fontSize } = TAMANOS[d.tamano];
  // El folio se guarda a veces como id interno de Laudus (puede venir
  // negativo); se muestra siempre en positivo, es solo cosmético — igual
  // que en el generador original.
  const docNumeroVisible = d.docNumero != null ? String(Math.abs(Number(d.docNumero))) : "";
  const cantidad = Math.max(1, d.cantidadCajas);

  const cajasHtml = Array.from({ length: cantidad }, (_, i) => i + 1)
    .map(
      (n) => `
    <div class="caratula">
      <div class="caja encabezado">
        <img class="logo" src="/branding/improfor-logo.png" alt="Improfor" />
        <div class="docTipo">${esc((d.docTipo || "").toUpperCase())}</div>
        <div class="docNumero">${esc(docNumeroVisible)}</div>
      </div>

      <div class="caja">
        <div class="lbl">SRES :</div>
        <div class="valGrande">${esc(d.cliente.toUpperCase())}</div>
        ${d.direccion ? `<div class="valGrande">${esc(d.direccion.toUpperCase())}</div>` : ""}
        ${d.comuna ? `<div class="valGrande">${esc(d.comuna.toUpperCase())}</div>` : ""}
      </div>

      ${
        d.transportista
          ? `<div class="caja transpCaja">
        <div class="transportista">${esc(d.transportista.toUpperCase())}</div>
        <div class="transportista">CARGO CUENTA</div>
        <div class="transportista">IMPROFOR</div>
      </div>`
          : ""
      }

      <div class="caja">
        <div class="lbl">ATT. SR.</div>
        ${d.contacto ? `<div class="val">${esc(d.contacto.toUpperCase())}</div>` : ""}
        ${d.telefonoContacto ? `<div class="val">FONO: ${esc(d.telefonoContacto)}</div>` : ""}
        ${d.oc ? `<div class="val">OC ${esc(d.oc)}</div>` : ""}
      </div>

      <div class="filaFinal">
        <div class="caja cajaNum">
          <div class="lbl">BOX QUANTITY</div>
          <div class="cajaNumBox">${String(n).padStart(2, "0")}/${String(cantidad).padStart(2, "0")}</div>
        </div>
        <div class="caja remitente">
          <div>IMPROFOR LTDA.</div>
          <div>CALLE BUSTOS 2154</div>
          <div>PROVIDENCIA.</div>
          <div>Stgo  tel: 562-2-495-7766</div>
        </div>
      </div>
    </div>`
    )
    .join("");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 20px 0 60px; display: flex; flex-direction: column; align-items: center; gap: 24px; background: #fff; }
  .caratula {
    width: ${width}px; font-size: ${fontSize}px;
    background: #fff; color: #000; border: 3px solid #000;
    font-family: Arial, Helvetica, sans-serif;
    display: flex; flex-direction: column;
    page-break-after: always;
  }
  .caja { border-bottom: 3px solid #000; padding: 10px 14px; }
  .caratula > .caja:last-child, .caratula > .filaFinal .caja:last-child { border-bottom: none; }
  .encabezado { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .logo { height: 5.5em; width: auto; max-width: 55%; object-fit: contain; }
  .docTipo { font-weight: 800; text-transform: uppercase; }
  .docNumero { font-size: 1.3em; font-weight: 800; }
  .lbl { font-size: 0.7em; font-weight: 700; text-transform: uppercase; color: #333; margin-bottom: 2px; }
  .val { font-size: 1em; font-weight: 700; }
  .valGrande { font-size: 1.15em; font-weight: 800; line-height: 1.35; }
  .transpCaja { text-align: left; }
  .transportista { font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; font-size: 1.3em; line-height: 1.3; }
  .filaFinal { display: flex; border-top: none; }
  .filaFinal .caja { flex: 1; border-bottom: none; }
  .filaFinal .caja:first-child { border-right: 3px solid #000; }
  .cajaNum { text-align: center; }
  .cajaNumBox { border: 2px solid #000; border-radius: 4px; margin-top: 6px; padding: 6px 0; font-size: 1.3em; font-weight: 800; text-align: center; }
  .remitente { font-size: 0.85em; font-weight: 700; line-height: 1.5; }
  @media print { body { padding: 0; gap: 0; } .caratula { border: 3px solid #000; } }
</style>
</head>
<body>${cajasHtml}</body>
</html>`;
}

// Mismo mecanismo que la etiqueta de Starken — iframe oculto 0×0 en vez de
// pestaña nueva, para que el diálogo de impresión se abra solo al cerrar
// el despacho, sin pop-ups ni pestañas extra.
export function imprimirCaratulas(d: DatosCaratula) {
  const html = construirHtmlCaratulas(d);
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  // Importante: appendChild dispara un primer "load" para el about:blank
  // inicial del iframe — si el handler ya estuviera puesto, imprimiría esa
  // página en blanco antes de que cargue el contenido real. Por eso se
  // agrega el iframe primero y el onload recién después, y srcdoc al final.
  document.body.appendChild(iframe);
  iframe.onload = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  };
  iframe.srcdoc = html;
}
