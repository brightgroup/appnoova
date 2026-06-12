"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode
} from "react";
import LeadCaptureModal from "@/components/landing/LeadCaptureModal";

export interface LeadCaptureIntent {
  source: string;
  planInterest?: string;
  title?: string;
  subtitle?: string;
}

interface LeadCaptureContextValue {
  openLeadCapture: (intent: LeadCaptureIntent) => void;
  closeLeadCapture: () => void;
}

const LeadCaptureContext = createContext<LeadCaptureContextValue | null>(null);

export function LeadCaptureProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [intent, setIntent] = useState<LeadCaptureIntent | null>(null);

  const openLeadCapture = useCallback((next: LeadCaptureIntent) => {
    setIntent(next);
    setOpen(true);
  }, []);

  const closeLeadCapture = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) {
      const t = window.setTimeout(() => setIntent(null), 300);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  return (
    <LeadCaptureContext.Provider value={{ openLeadCapture, closeLeadCapture }}>
      {children}
      <LeadCaptureModal open={open} intent={intent} onClose={closeLeadCapture} />
    </LeadCaptureContext.Provider>
  );
}

export function useLeadCapture(): LeadCaptureContextValue {
  const ctx = useContext(LeadCaptureContext);
  if (!ctx) {
    throw new Error("useLeadCapture debe usarse dentro de LeadCaptureProvider");
  }
  return ctx;
}

/** Abre el formulario cuando la URL trae ?solicitar=acceso (login / signup). */
export function LeadCaptureUrlOpener() {
  const { openLeadCapture } = useLeadCapture();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("solicitar") !== "acceso") return;

    openLeadCapture({
      source: "request_access",
      planInterest: "acceso",
      title: "Solicitar acceso a Noova 360",
      subtitle: "Complete el formulario y activaremos su cuenta manualmente"
    });
  }, [openLeadCapture]);

  return null;
}
