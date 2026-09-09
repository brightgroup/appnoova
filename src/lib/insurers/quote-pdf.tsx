import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { QuoteRequestRecord } from "@/lib/insurers/quote-requests-db";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: "Helvetica", color: "#111" },
  header: { marginBottom: 24, borderBottom: "2 solid #0f7eff", paddingBottom: 12 },
  companyName: { fontSize: 18, fontWeight: 700, color: "#0f2a52" },
  title: { fontSize: 13, marginTop: 4, color: "#0f7eff" },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 10, textTransform: "uppercase", color: "#666", marginBottom: 6, letterSpacing: 1 },
  row: { flexDirection: "row", marginBottom: 3 },
  label: { width: 140, color: "#555" },
  value: { flex: 1, fontWeight: 700 },
  primaBox: {
    marginTop: 8,
    padding: 16,
    backgroundColor: "#f0f7ff",
    borderRadius: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  primaLabel: { fontSize: 11, color: "#333" },
  primaValue: { fontSize: 20, fontWeight: 700, color: "#0f7eff" },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, fontSize: 8, color: "#999", textAlign: "center" }
});

function formatCop(value: number | null | undefined): string {
  if (value == null) return "Por confirmar";
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });
  } catch {
    return value;
  }
}

const RAMO_LABEL: Record<string, string> = { autos: "Seguro de Auto", vida: "Seguro de Vida", hogar: "Seguro de Hogar" };

export function QuotePdfDocument({ quote, companyName }: { quote: QuoteRequestRecord; companyName: string }) {
  const vehiculo = quote.vehiculo as { marca?: string; linea?: string; modelo?: number; codigo_fasecolda?: string };
  const datosRiesgo = quote.datosRiesgo as Record<string, string | undefined>;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.companyName}>{companyName}</Text>
          <Text style={styles.title}>{RAMO_LABEL[quote.ramo] ?? `Seguro de ${quote.ramo}`} — Cotización</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tomador</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Nombre</Text>
            <Text style={styles.value}>{quote.tomador.nombre_tomador ?? "—"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Documento</Text>
            <Text style={styles.value}>{quote.tomador.documento_tomador ?? "—"}</Text>
          </View>
        </View>

        {quote.ramo === "autos" && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Vehículo</Text>
            <View style={styles.row}>
              <Text style={styles.label}>Placa</Text>
              <Text style={styles.value}>{quote.placa ?? "—"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Marca / línea</Text>
              <Text style={styles.value}>{[vehiculo?.marca, vehiculo?.linea].filter(Boolean).join(" ") || "—"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Modelo</Text>
              <Text style={styles.value}>{vehiculo?.modelo ?? "—"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Código Fasecolda</Text>
              <Text style={styles.value}>{vehiculo?.codigo_fasecolda ?? "—"}</Text>
            </View>
          </View>
        )}

        {quote.ramo !== "autos" && datosRiesgo && Object.keys(datosRiesgo).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Datos del riesgo</Text>
            {Object.entries(datosRiesgo)
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <View style={styles.row} key={k}>
                  <Text style={styles.label}>{k.replace(/_/g, " ")}</Text>
                  <Text style={styles.value}>{String(v)}</Text>
                </View>
              ))}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cotización</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Aseguradora</Text>
            <Text style={styles.value}>{quote.resultado?.aseguradora ?? "Por confirmar"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Vigencia</Text>
            <Text style={styles.value}>
              {formatDate(quote.resultado?.vigencia_desde)} — {formatDate(quote.resultado?.vigencia_hasta)}
            </Text>
          </View>
          <View style={styles.primaBox}>
            <Text style={styles.primaLabel}>Prima total</Text>
            <Text style={styles.primaValue}>{formatCop(quote.resultado?.prima)}</Text>
          </View>
        </View>

        <Text style={styles.footer}>
          Esta cotización es una referencia informativa, sujeta a la confirmación final de la aseguradora. Generada
          por {companyName} — {new Date().toLocaleDateString("es-CO")}.
        </Text>
      </Page>
    </Document>
  );
}

export async function generateQuotePdfBuffer(quote: QuoteRequestRecord, companyName: string): Promise<Buffer> {
  return renderToBuffer(<QuotePdfDocument quote={quote} companyName={companyName} />);
}
