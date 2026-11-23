// Cliente de la API REST de Laudus (https://laudus.cl/ayuda/api/) — por ahora
// solo lectura (ver órdenes de venta para traerlas a Despacho). El token se
// cachea en memoria del proceso entre llamadas hasta que expira; en
// serverless cada cold start vuelve a loguearse, lo cual está bien dado el
// volumen bajo de uso manual ("botón Sincronizar").

const BASE_URL = process.env.LAUDUS_API_URL || "https://api.laudus.cl";

let tokenCache: { token: string; expiracion: number } | null = null;

async function obtenerToken(): Promise<string> {
  if (tokenCache && tokenCache.expiracion > Date.now() + 30_000) {
    return tokenCache.token;
  }
  const res = await fetch(`${BASE_URL}/security/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      userName: process.env.LAUDUS_USERNAME,
      password: process.env.LAUDUS_PASSWORD,
      companyVATId: process.env.LAUDUS_COMPANY_VAT_ID,
    }),
  });
  if (!res.ok) {
    throw new Error(`Laudus: no se pudo iniciar sesión (${res.status})`);
  }
  const data = await res.json();
  tokenCache = { token: data.token, expiracion: new Date(data.expiration).getTime() };
  return tokenCache.token;
}

async function laudusGet(path: string) {
  const token = await obtenerToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const texto = await res.text().catch(() => "");
    throw new Error(`Laudus ${path}: ${res.status} ${texto}`);
  }
  return res.json();
}

export type LaudusOrden = {
  salesOrderId: number;
  customer: { customerId: number; name: string; legalName: string; VATId: string; email: string };
  contact: { firstName?: string; lastName?: string } | null;
  carrier: { name: string } | null;
  deliveryAddress: { address: string; city: string; county: string } | null;
  deliveryNotes: string;
  notes: string;
  issuedDate: string;
  items: Array<{
    itemId: number;
    product: { sku: string; description: string; unitOfMeasure: string };
    itemDescription: string;
    quantity: number;
    unitPrice: number;
  }>;
};

export type LaudusCliente = {
  customerId: number;
  address: string;
  city: string;
  county: string;
  addressBilling: string;
  cityBilling: string;
  countyBilling: string;
  phone1: string;
};

export async function obtenerOrdenVentaLaudus(salesOrderId: number): Promise<LaudusOrden> {
  return laudusGet(`/sales/orders/${salesOrderId}`);
}

// Pedidos de e-commerce (WooCommerce) llegan con deliveryAddress vacío —
// la dirección de envío nunca se sincronizó a ese campo de la orden en
// Laudus (confirmado contra datos reales: todo pedido con source
// "WooCommerce" trae deliveryAddress null). Ahí se usa la ficha del
// cliente como respaldo.
export async function obtenerClienteLaudus(customerId: number): Promise<LaudusCliente> {
  return laudusGet(`/sales/customers/${customerId}`);
}
