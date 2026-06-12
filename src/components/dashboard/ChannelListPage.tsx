"use client";

import Link from "next/link";
import { ChevronLeft, Loader2 } from "lucide-react";
import { registryPage, registryToolbar, registryContent, textMuted } from "@/lib/brand-ui";
import { RegistryTableLayout } from "@/components/ui/RegistryTableLayout";

interface ChannelListPageProps {
  title: string;
  description: string;
  loading?: boolean;
  tableDescription?: string;
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  action?: React.ReactNode;
  footer?: React.ReactNode;
  error?: React.ReactNode;
  children: React.ReactNode;
}

export function ChannelListPage({
  title,
  description,
  loading,
  tableDescription,
  search,
  onSearchChange,
  searchPlaceholder,
  onRefresh,
  refreshing,
  action,
  footer,
  error,
  children
}: ChannelListPageProps) {
  return (
    <div className={registryPage}>
      <div className={registryToolbar}>
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/dashboard"
            className="p-1.5 hover:bg-white/[.06] rounded-lg transition-colors text-gray-400 hover:text-white shrink-0"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{title}</h1>
            <p className={`text-xs ${textMuted} mt-0.5 max-w-2xl`}>{description}</p>
          </div>
        </div>
      </div>

      <div className={registryContent}>
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Cargando...
          </div>
        ) : (
          <RegistryTableLayout
            description={tableDescription}
            search={search}
            onSearchChange={onSearchChange}
            searchPlaceholder={searchPlaceholder}
            onRefresh={onRefresh}
            refreshing={refreshing}
            action={action}
            error={error}
            footer={footer}
          >
            {children}
          </RegistryTableLayout>
        )}
      </div>
    </div>
  );
}
