"use client";

import { useEffect } from "react";
import { getLandingWidgetSlug } from "@/lib/landing-widget";
import { getAppUrl } from "@/lib/marketing-api";

const WIDGET_SLUG = getLandingWidgetSlug();
const WIDGET_COLOR = process.env.NEXT_PUBLIC_LANDING_WIDGET_COLOR?.trim() || "#5b5bf6";

/**
 * Burbuja de chat en la landing de seguros (/iaseguros).
 * El script y el API del widget viven en app.noova360.com.
 */
export default function LandingWidgetEmbed() {
  useEffect(() => {
    if (!WIDGET_SLUG) return;
    if (document.getElementById("noova-widget-host")) return;
    if (document.querySelector("script[data-noova-landing-widget]")) return;

    const appOrigin = getAppUrl();
    const script = document.createElement("script");
    script.src = `${appOrigin}/noova-widget.js`;
    script.async = true;
    script.setAttribute("data-slug", WIDGET_SLUG);
    script.setAttribute("data-base", appOrigin);
    script.setAttribute("data-color", WIDGET_COLOR);
    script.setAttribute("data-preview", "1");
    script.setAttribute("data-noova-landing-widget", "true");
    document.body.appendChild(script);
  }, []);

  return null;
}
