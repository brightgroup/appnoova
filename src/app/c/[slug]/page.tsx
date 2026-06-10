import { notFound } from "next/navigation";
import { getPublishedMicrositeBySlug } from "@/lib/microsite-server";
import AgenteClientesShell from "@/app/agenteclientes/AgenteClientesShell";

export default async function MicrositeShortPathPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const resolved = await getPublishedMicrositeBySlug(slug);

  if (!resolved) {
    notFound();
  }

  return <AgenteClientesShell config={resolved.config} />;
}
