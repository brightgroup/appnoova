import type { Metadata } from "next";
import "@/components/widget/web-chat-widget.css";

export const metadata: Metadata = {
  title: "Chat",
  robots: { index: false, follow: false }
};

export default function WidgetLayout({ children }: { children: React.ReactNode }) {
  return children;
}
