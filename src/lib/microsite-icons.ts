import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Bell,
  Briefcase,
  Building2,
  Calculator,
  Calendar,
  Car,
  ClipboardList,
  Clock,
  CreditCard,
  FileCheck,
  FileText,
  Gift,
  Heart,
  HelpCircle,
  Home,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  Shield,
  Star,
  Umbrella,
  User,
  Users,
  Zap
} from "lucide-react";

export const MICROSITE_LUCIDE_ICONS: Record<string, LucideIcon> = {
  Calculator,
  HelpCircle,
  FileCheck,
  AlertTriangle,
  RefreshCw,
  MessageCircle,
  Shield,
  Heart,
  Phone,
  Mail,
  Car,
  Home,
  Umbrella,
  Star,
  CreditCard,
  Calendar,
  Clock,
  MapPin,
  Users,
  User,
  Building2,
  Briefcase,
  ClipboardList,
  FileText,
  Search,
  Bell,
  Gift,
  Zap
};

export const MICROSITE_ICON_OPTIONS = Object.keys(MICROSITE_LUCIDE_ICONS);

export function resolveMicrositeIcon(name: string): LucideIcon {
  return MICROSITE_LUCIDE_ICONS[name] ?? MessageCircle;
}
