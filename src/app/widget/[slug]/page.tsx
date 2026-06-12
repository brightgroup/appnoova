import { notFound } from "next/navigation";
import { isLandingWidgetPreview } from "@/lib/landing-widget";
import { getWidgetBySlug } from "@/lib/widget-server";
import WebChatWidget from "@/components/widget/WebChatWidget";

export default async function WidgetEmbedPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { slug } = await params;
  const { preview } = await searchParams;
  const landingPreview = isLandingWidgetPreview(slug, preview);

  const resolved = await getWidgetBySlug(slug, {
    requirePublished: !landingPreview
  });

  if (!resolved) {
    notFound();
  }

  return <WebChatWidget config={resolved.config} previewMode={landingPreview} />;
}
