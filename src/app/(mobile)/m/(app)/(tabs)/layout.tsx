"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChatsTabIcon, LeadsTabIcon, AccountTabIcon } from "../../icons";

export default function MobileTabsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isChats = pathname === "/m/chats";
  const isLeads = pathname === "/m/leads";
  const isCuenta = pathname === "/m/cuenta";

  return (
    <>
      {children}
      <nav className="tabbar" aria-label="Navegación">
        <Link href="/m/chats" className={`tab${isChats ? " active" : ""}`}>
          <ChatsTabIcon />
          <span className="tab-lbl">Chats</span>
        </Link>
        <Link href="/m/leads" className={`tab${isLeads ? " active" : ""}`}>
          <LeadsTabIcon />
          <span className="tab-lbl">Leads</span>
        </Link>
        <Link href="/m/cuenta" className={`tab${isCuenta ? " active" : ""}`}>
          <AccountTabIcon />
          <span className="tab-lbl">Cuenta</span>
        </Link>
      </nav>
    </>
  );
}
