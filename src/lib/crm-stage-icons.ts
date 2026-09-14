import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlarmClock,
  AlertCircle,
  AlertTriangle,
  Archive,
  Award,
  Ban,
  Banknote,
  BarChart3,
  Bell,
  BellRing,
  Bookmark,
  Briefcase,
  Building2,
  Calendar,
  CalendarCheck,
  Camera,
  Car,
  Check,
  CheckCheck,
  CheckCircle2,
  Circle,
  CircleDollarSign,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Cloud,
  Coins,
  Compass,
  CreditCard,
  Crown,
  DollarSign,
  Download,
  Eye,
  FileCheck,
  FileClock,
  FileText,
  FileWarning,
  Flag,
  FolderOpen,
  Gauge,
  Gift,
  Globe,
  GraduationCap,
  Handshake,
  Headphones,
  Heart,
  HelpCircle,
  Home,
  Hourglass,
  Inbox,
  Info,
  Key,
  Landmark,
  Layers,
  Lightbulb,
  Link2,
  ListChecks,
  Loader,
  Lock,
  Mail,
  MailCheck,
  MapPin,
  MessageCircle,
  MessageSquare,
  Mic,
  Milestone,
  MousePointerClick,
  Package,
  Paperclip,
  Pause,
  Percent,
  Phone,
  PhoneCall,
  PiggyBank,
  Play,
  Plane,
  PlusCircle,
  Pin,
  Puzzle,
  Radar,
  Receipt,
  RefreshCw,
  Repeat,
  Rocket,
  Send,
  Share2,
  Shield,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Star,
  Sun,
  Tag,
  Target,
  ThumbsDown,
  ThumbsUp,
  Timer,
  TrendingDown,
  TrendingUp,
  Trophy,
  Truck,
  Umbrella,
  User,
  UserCheck,
  UserPlus,
  Users,
  Video,
  Wallet,
  Wand2,
  Watch,
  Wrench,
  X,
  XCircle,
  Zap
} from "lucide-react";

/**
 * Biblioteca de iconos para etapas del pipeline de Leads — pedida
 * explícitamente por el usuario ("biblioteca más amplia de iconos"),
 * agrupada por categoría para navegarla en el picker (modal con buscador).
 * Separada de microsite-icons.ts a propósito: son features distintas.
 */
export const CRM_STAGE_ICON_GROUPS: { label: string; icons: string[] }[] = [
  {
    label: "Estado y flujo",
    icons: [
      "Inbox", "Clock", "Hourglass", "Timer", "AlarmClock", "Loader", "RefreshCw", "Repeat",
      "CheckCircle2", "CheckCheck", "Check", "XCircle", "X", "Ban", "Pause", "Play",
      "Circle", "Flag", "Milestone", "Pin", "Bookmark", "Archive"
    ]
  },
  {
    label: "Comunicación",
    icons: [
      "Phone", "PhoneCall", "MessageCircle", "MessageSquare", "Mail", "MailCheck", "Send",
      "Video", "Mic", "Headphones", "Share2", "Link2", "Bell", "BellRing"
    ]
  },
  {
    label: "Ventas y dinero",
    icons: [
      "DollarSign", "CircleDollarSign", "Banknote", "Coins", "PiggyBank", "Wallet", "CreditCard",
      "Receipt", "Percent", "TrendingUp", "TrendingDown", "BarChart3", "Gauge", "ShoppingCart",
      "ShoppingBag", "Tag", "Target", "Handshake", "Trophy", "Award", "Crown"
    ]
  },
  {
    label: "Personas",
    icons: [
      "User", "Users", "UserCheck", "UserPlus", "Eye", "MousePointerClick", "ThumbsUp",
      "ThumbsDown", "Heart", "Star", "GraduationCap"
    ]
  },
  {
    label: "Documentos y tareas",
    icons: [
      "FileText", "FileCheck", "FileClock", "FileWarning", "ClipboardList", "ClipboardCheck",
      "ListChecks", "Paperclip", "FolderOpen", "Download", "Key", "Lock"
    ]
  },
  {
    label: "Alertas",
    icons: ["AlertCircle", "AlertTriangle", "HelpCircle", "Info", "Radar", "Activity"]
  },
  {
    label: "Negocio y lugares",
    icons: [
      "Briefcase", "Building2", "Landmark", "Home", "Globe", "MapPin", "Compass", "Calendar",
      "CalendarCheck", "Truck", "Car", "Plane", "Package"
    ]
  },
  {
    label: "Otros",
    icons: [
      "Shield", "ShieldCheck", "Umbrella", "Sparkles", "Zap", "Rocket", "Lightbulb", "Wand2",
      "Puzzle", "Layers", "Gift", "Camera", "Watch", "Wrench", "Cloud", "Sun", "PlusCircle"
    ]
  }
];

export const CRM_STAGE_LUCIDE_ICONS: Record<string, LucideIcon> = {
  Activity, AlarmClock, AlertCircle, AlertTriangle, Archive, Award, Ban, Banknote, BarChart3,
  Bell, BellRing, Bookmark, Briefcase, Building2, Calendar, CalendarCheck, Camera, Car, Check,
  CheckCheck, CheckCircle2, Circle, CircleDollarSign, ClipboardCheck, ClipboardList, Clock,
  Cloud, Coins, Compass, CreditCard, Crown, DollarSign, Download, Eye, FileCheck, FileClock,
  FileText, FileWarning, Flag, FolderOpen, Gauge, Gift, Globe, GraduationCap, Handshake,
  Headphones, Heart, HelpCircle, Home, Hourglass, Inbox, Info, Key, Landmark, Layers, Lightbulb,
  Link2, ListChecks, Loader, Lock, Mail, MailCheck, MapPin, MessageCircle, MessageSquare, Mic,
  Milestone, MousePointerClick, Package, Paperclip, Pause, Percent, Phone, PhoneCall, PiggyBank,
  Play, Plane, PlusCircle, Pin, Puzzle, Radar, Receipt, RefreshCw, Repeat, Rocket, Send, Share2,
  Shield, ShieldCheck, ShoppingBag, ShoppingCart, Sparkles, Star, Sun, Tag, Target, ThumbsDown,
  ThumbsUp, Timer, TrendingDown, TrendingUp, Trophy, Truck, Umbrella, User, UserCheck, UserPlus,
  Users, Video, Wallet, Wand2, Watch, Wrench, X, XCircle, Zap
};

export const CRM_STAGE_ICON_OPTIONS = Object.keys(CRM_STAGE_LUCIDE_ICONS);

export function resolveCrmStageIcon(name: string | null | undefined): LucideIcon {
  if (!name) return Circle;
  return CRM_STAGE_LUCIDE_ICONS[name] ?? Circle;
}
