// Documento tributario del despacho — se genera al cerrar el despacho en
// Bodega ("Preparar y cerrar despacho"). Por ahora NO llama a la API real
// de Laudus (emitir un DTE real es irreversible) — genera un placeholder
// con el monto/líneas reales, salvo que el pedido sea "factura anticipada",
// caso en el que se reutiliza la factura que Cobranzas ya emitió en vez de
// crear una nueva.

import type { Pedido, Producto } from "@prisma/client";

export type LineaDocumento = {
  sku: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
};

export type DocumentoTributario = {
  tipo: string; // "Guía de despacho" | "Factura" | "Boleta" | "Factura anticipada (ya emitida)"
  folio: string;
  monto: number;
  lineas: LineaDocumento[];
  emitidoEn: string;
  reutilizada: boolean; // true = es la factura anticipada que ya existía, no se creó nada
  placeholder: boolean; // true = simulado, todavía no se llama a la API real de Laudus
};

// Solo se puede armar el documento con datos reales si el pedido vino de
// Laudus (itemId + precio por línea) — un pedido manual/de prueba no tiene
// cómo enlazarse (traceFrom) ni precio real, así que no genera nada.
export function puedeGenerarDocumentoTributario(pedido: Pedido, productos: Producto[]) {
  return pedido.salesOrderIdLaudus != null && productos.some((p) => p.itemIdLaudus != null && p.precioUnitarioLaudus != null);
}

export function generarDocumentoTributario(pedido: Pedido, productos: Producto[]): DocumentoTributario {
  const lineas: LineaDocumento[] = productos
    .filter((p) => p.itemIdLaudus != null && p.precioUnitarioLaudus != null)
    .map((p) => ({
      sku: p.sku,
      nombre: p.nombre,
      cantidad: p.cantidad,
      precioUnitario: p.precioUnitarioLaudus!,
      subtotal: Math.round(p.cantidad * p.precioUnitarioLaudus!),
    }));
  const monto = lineas.reduce((acc, l) => acc + l.subtotal, 0);
  const emitidoEn = new Date().toISOString();

  // Factura anticipada: Cobranzas ya emitió el documento (pedido.facturaNumero)
  // antes de que Bodega despachara — se enlaza esa factura, no se crea otra
  // (emitir dos documentos para el mismo despacho sería un doble cobro).
  if (pedido.facturaAnticipada && pedido.facturaNumero) {
    return {
      tipo: "Factura anticipada (ya emitida)",
      folio: pedido.facturaNumero,
      monto,
      lineas,
      emitidoEn,
      reutilizada: true,
      placeholder: false,
    };
  }

  return {
    tipo: pedido.documento || "Guía de despacho",
    folio: `SIMULADO-${pedido.id}-${Date.now()}`,
    monto,
    lineas,
    emitidoEn,
    reutilizada: false,
    placeholder: true,
  };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function clp(n: number): string {
  return "$ " + Math.round(n).toLocaleString("es-CL");
}

export function construirHtmlDocumentoTributario(doc: DocumentoTributario, cliente: string): string {
  const filas = doc.lineas
    .map(
      (l) => `
      <tr>
        <td>${esc(l.sku)}</td>
        <td>${esc(l.nombre)}</td>
        <td style="text-align:center">${l.cantidad}</td>
        <td style="text-align:right">${clp(l.precioUnitario)}</td>
        <td style="text-align:right">${clp(l.subtotal)}</td>
      </tr>`
    )
    .join("");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px; font-family: Arial, Helvetica, sans-serif; color: #000; }
  .marca-agua { color: #c8871f; font-weight: 800; font-size: 13px; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 10px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .sub { font-size: 13px; color: #444; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { border: 1px solid #000; padding: 6px 8px; }
  th { background: #eee; text-align: left; }
  tfoot td { font-weight: 800; }
  @media print { .marca-agua { color: #000; } }
</style>
</head>
<body>
  ${doc.placeholder ? `<div class="marca-agua">🧪 Documento simulado — no emitido en Laudus todavía</div>` : ""}
  <h1>${esc(doc.tipo)}</h1>
  <div class="sub">Folio: ${esc(doc.folio)} · Cliente: ${esc(cliente)} · ${new Date(doc.emitidoEn).toLocaleString("es-CL")}</div>
  <table>
    <thead>
      <tr><th>SKU</th><th>Producto</th><th>Cant.</th><th>Precio unit.</th><th>Subtotal</th></tr>
    </thead>
    <tbody>${filas}</tbody>
    <tfoot>
      <tr><td colspan="4" style="text-align:right">Total</td><td style="text-align:right">${clp(doc.monto)}</td></tr>
    </tfoot>
  </table>
</body>
</html>`;
}

// Mismo mecanismo que la etiqueta/carátula — iframe oculto 0×0 para que el
// diálogo de impresión se abra solo, sin pestañas extra.
export function imprimirDocumentoTributario(doc: DocumentoTributario, cliente: string) {
  const html = construirHtmlDocumentoTributario(doc, cliente);
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);
  iframe.onload = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  };
  iframe.srcdoc = html;
}
