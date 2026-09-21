import type { SupabaseClient } from "@supabase/supabase-js";
import { siigoRequest, SiigoError } from "./client";
import { resolveDaneCity } from "./dane-cities";
import type { OrganizationBillingProfile } from "../billing-profile";

const SIIGO_ID_TYPE_BY_DOCUMENTO: Record<OrganizationBillingProfile["tipo_documento"], string> = {
  CC: "13",
  CE: "22",
  NIT: "31",
  PA: "41",
};

const NOOVA_PRODUCT_CODE = "NOOVA-SUSCRIPCION";
const IVA_19_TAX_ID = 8683;

interface SiigoCustomerSearchResult {
  results: { id: string; identification: string }[];
}

interface SiigoCustomerCreated {
  id: string;
  identification: string;
}

interface SiigoProductSearchResult {
  results: { id: string; code: string }[];
}

interface SiigoInvoiceCreated {
  id: string;
  number: number;
  name: string;
  public_url?: string;
  stamp?: { status?: string };
}

/** Busca el cliente en Siigo por NIT/documento; lo crea si no existe. Cachea el id en organization_billing_profiles.siigo_customer_id. */
export async function ensureSiigoCustomer(
  db: SupabaseClient,
  profile: OrganizationBillingProfile
): Promise<string> {
  if (profile.siigo_customer_id) return profile.siigo_customer_id;

  const found = await siigoRequest<SiigoCustomerSearchResult>(
    "GET",
    `/v1/customers?identification=${encodeURIComponent(profile.numero_documento)}`
  );
  const existingId = found.results?.[0]?.id;
  if (existingId) {
    await db
      .from("organization_billing_profiles")
      .update({ siigo_customer_id: existingId })
      .eq("organization_id", profile.organization_id);
    return existingId;
  }

  const city = resolveDaneCity(profile.ciudad);
  if (!city) {
    throw new SiigoError(
      `Ciudad "${profile.ciudad ?? ""}" no está en el catálogo DANE local — completa el cliente manualmente en Siigo`
    );
  }

  const isCompany = profile.tipo_persona === "juridica";
  const [firstName, ...rest] = profile.razon_social.trim().split(/\s+/);
  const name = isCompany ? [profile.razon_social] : [firstName, rest.join(" ") || firstName];

  const created = await siigoRequest<SiigoCustomerCreated>("POST", "/v1/customers", {
    type: "Customer",
    person_type: isCompany ? "Company" : "Person",
    id_type: SIIGO_ID_TYPE_BY_DOCUMENTO[profile.tipo_documento],
    identification: profile.numero_documento,
    check_digit: profile.digito_verificacion || undefined,
    name,
    branch_office: 0,
    active: true,
    vat_responsible: false,
    fiscal_responsibilities: [{ code: "R-99-PN" }],
    address: {
      address: profile.direccion || "N/A",
      city: { country_code: "CO", state_code: city.state_code, city_code: city.city_code },
    },
    phones: profile.telefono ? [{ indicative: "57", number: profile.telefono }] : [],
    contacts: [
      {
        first_name: firstName,
        last_name: isCompany ? "" : rest.join(" ") || firstName,
        email: profile.email_facturacion || undefined,
      },
    ],
  });

  await db
    .from("organization_billing_profiles")
    .update({ siigo_customer_id: created.id })
    .eq("organization_id", profile.organization_id);

  return created.id;
}

/** El código de producto genérico "Suscripción Noova 360" — se crea una vez si no existe. */
async function ensureNoovaProduct(): Promise<string> {
  const found = await siigoRequest<SiigoProductSearchResult>(
    "GET",
    `/v1/products?code=${encodeURIComponent(NOOVA_PRODUCT_CODE)}`
  );
  if (found.results?.[0]?.code) return NOOVA_PRODUCT_CODE;

  await siigoRequest("POST", "/v1/products", {
    code: NOOVA_PRODUCT_CODE,
    name: "Suscripción Noova 360",
    account_group: 827,
    type: "Service",
    stock_control: false,
    tax_classification: "Taxed",
    tax_included: true,
    taxes: [{ id: IVA_19_TAX_ID }],
    unit_label: "unidad",
    prices: [{ currency_code: "COP", price_list: [{ position: 1, value: 0 }] }],
  });
  return NOOVA_PRODUCT_CODE;
}

export interface EmitSiigoInvoiceParams {
  organizationId: string;
  organizationName: string;
  planName: string;
  amountCop: number;
  billingInvoiceId: string | null;
}

/**
 * Emite (o intenta emitir) la factura electrónica DIAN del pago en Siigo.
 * Nunca debe tumbar el flujo de pago: quien la llama la envuelve en try/catch
 * y solo registra éxito/fracaso en `billing_invoices` — el crédito/activación
 * del plan ya ocurrió antes de esto vía billing_record_bold_payment /
 * billing_record_paddle_payment.
 */
export async function emitSiigoInvoiceForPayment(
  db: SupabaseClient,
  params: EmitSiigoInvoiceParams
): Promise<void> {
  const { data: profile } = await db
    .from("organization_billing_profiles")
    .select("*")
    .eq("organization_id", params.organizationId)
    .maybeSingle();

  if (!profile) {
    throw new SiigoError(`Org ${params.organizationId} no tiene organization_billing_profiles — no se puede facturar`);
  }

  const sellerId = Number(process.env.SIIGO_SELLER_ID);
  const documentId = Number(process.env.SIIGO_ELECTRONIC_DOCUMENT_ID);
  const paymentTypeId = Number(process.env.SIIGO_PAYMENT_TYPE_ID);
  if (!sellerId || !documentId || !paymentTypeId) {
    throw new SiigoError("Faltan SIIGO_SELLER_ID / SIIGO_ELECTRONIC_DOCUMENT_ID / SIIGO_PAYMENT_TYPE_ID en el entorno");
  }

  const [, productCode] = await Promise.all([
    ensureSiigoCustomer(db, profile as OrganizationBillingProfile),
    ensureNoovaProduct(),
  ]);

  const invoice = await siigoRequest<SiigoInvoiceCreated>("POST", "/v1/invoices", {
    document: { id: documentId },
    date: new Date().toISOString().slice(0, 10),
    customer: { identification: profile.numero_documento, branch_office: 0 },
    seller: sellerId,
    items: [
      {
        code: productCode,
        description: `Suscripción Noova 360 — Plan ${params.planName} (${params.organizationName})`,
        quantity: 1,
        price: params.amountCop,
      },
    ],
    payments: [{ id: paymentTypeId, value: params.amountCop }],
    stamp: { send: true },
    mail: { send: Boolean(profile.email_facturacion) },
  });

  if (params.billingInvoiceId) {
    await db
      .from("billing_invoices")
      .update({
        siigo_invoice_id: invoice.id,
        siigo_invoice_number: invoice.name,
        siigo_invoice_url: invoice.public_url ?? null,
        siigo_invoice_error: null,
      })
      .eq("id", params.billingInvoiceId);
  }
}
