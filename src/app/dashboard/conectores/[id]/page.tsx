import { ConnectorDetailView } from "@/components/automations/ConnectorDetailView";

export default async function ConnectorDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;

  return <ConnectorDetailView connectionId={id} initialTab={tab} />;
}
