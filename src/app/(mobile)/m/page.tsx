"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { AppLoader } from "./AppLoader";

const INSTALL_SEEN_KEY = "noova-m-install-seen";

export default function MobileSplashPage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function decide() {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;

      if (!data.session) {
        router.replace("/m/login");
        return;
      }

      const installSeen = (() => {
        try {
          return localStorage.getItem(INSTALL_SEEN_KEY) === "1";
        } catch {
          return true;
        }
      })();

      router.replace(installSeen ? "/m/chats" : "/m/install");
    }

    const timer = setTimeout(decide, 900);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [router]);

  return (
    <div className="nv-m-onboarding" style={{ flex: 1 }}>
      <div className="onb-center">
        <AppLoader />
      </div>
    </div>
  );
}
