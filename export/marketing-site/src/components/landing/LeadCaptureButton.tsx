"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useLeadCapture, type LeadCaptureIntent } from "@/components/landing/LeadCaptureProvider";

type LeadCaptureButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {
  intent: LeadCaptureIntent;
  children: ReactNode;
};

export default function LeadCaptureButton({
  intent,
  children,
  className,
  type = "button",
  ...rest
}: LeadCaptureButtonProps) {
  const { openLeadCapture } = useLeadCapture();

  return (
    <button
      type={type}
      className={className}
      onClick={() => openLeadCapture(intent)}
      {...rest}
    >
      {children}
    </button>
  );
}
