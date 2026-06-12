import { MicrositeConfigPanel } from "@/components/microsite/MicrositeConfigPanel";

export default function MiLinkConfiguracionPage() {
  return (
    <MicrositeConfigPanel
      basePath="/dashboard/canales/mi-link/configuracion"
      setupPath="/dashboard/canales/mi-link"
      backHref="/dashboard/canales"
      includeWidgetEmbed={false}
    />
  );
}
