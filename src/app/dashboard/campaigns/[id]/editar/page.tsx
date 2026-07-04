"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/telephony-api";

export default function EditarCampanaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  useEffect(() => {
    void authFetch(`/api/campaigns/${id}`).then(async res => {
      const json = await res.json();
      if (!res.ok) {
        router.replace("/dashboard/campaigns");
        return;
      }
      const c = json.campaign as { status: string; wizard_step: number };
      if (c.status === "draft" && c.wizard_step < 3) {
        router.replace(`/dashboard/campaigns?wizard=${id}`);
      } else {
        router.replace(`/dashboard/campaigns/${id}?tab=general`);
      }
    });
  }, [id, router]);

  return null;
}
