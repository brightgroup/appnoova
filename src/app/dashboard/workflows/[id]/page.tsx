import { WorkflowEditor } from "@/components/automations/WorkflowEditor";

export default async function WorkflowDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;

  return <WorkflowEditor workflowId={id} initialTab={tab} />;
}
