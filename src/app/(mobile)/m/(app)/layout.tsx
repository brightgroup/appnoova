"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { authFetch } from "@/lib/telephony-api";

export default function MobileAppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [orgStatus, setOrgStatus] = useState("active");

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (!data.session) {
        router.replace("/m/login");
        return;
      }
      setReady(true);
      authFetch("/api/org/me")
        .then((res) => res.json())
        .then((json) => {
          if (!cancelled) setOrgStatus(json?.organization?.status ?? "active");
        })
        .catch(() => {});
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace("/m/login");
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  if (!ready) {
    return (
      <div className="nv-m-onboarding" style={{ flex: 1 }}>
        <div className="onb-center">
          <div className="dots">
            <i />
            <i />
            <i />
          </div>
        </div>
      </div>
    );
  }

  if (orgStatus === "suspended" || orgStatus === "disabled") {
    return (
      <div className="nv-m-onboarding" style={{ flex: 1 }}>
        <div className="onb-center" style={{ textAlign: "center", padding: "0 24px", gap: 12 }}>
          <Lock className="w-7 h-7" style={{ color: "#f87171", margin: "0 auto" }} />
          <p style={{ fontWeight: 600, fontSize: 16 }}>
            {orgStatus === "disabled" ? "Cuenta desactivada" : "Cuenta suspendida"}
          </p>
          <p style={{ fontSize: 13, opacity: 0.7 }}>
            {orgStatus === "disabled"
              ? "Contacta a soporte Noova si crees que es un error."
              : "Abre el panel web para regularizar el pago y reactivar tu cuenta."}
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
