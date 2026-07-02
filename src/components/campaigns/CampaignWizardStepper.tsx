"use client";

import { Check } from "lucide-react";
import { CAMPAIGN_WIZARD_STEPS } from "@/types/voice-campaign";

interface CampaignWizardStepperProps {
  currentStep: number;
}

export function CampaignWizardStepper({ currentStep }: CampaignWizardStepperProps) {
  return (
    <div className="px-6 py-5 border-b border-white/[.08] shrink-0">
      <div className="flex items-center gap-0 max-w-4xl mx-auto">
        {CAMPAIGN_WIZARD_STEPS.map((step, i) => {
          const done = currentStep > step.id;
          const active = currentStep === step.id;
          return (
            <div key={step.id} className="flex items-center flex-1 min-w-0 last:flex-none">
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                    done
                      ? "nv-wizard-step-done bg-[#5b5bf6] text-white"
                      : active
                        ? "nv-wizard-step-active bg-[#5b5bf6] text-white ring-2 ring-[#5b5bf6]/40"
                        : "bg-white/[.06] text-gray-500 border border-white/[.10]"
                  }`}
                >
                  {done ? <Check className="w-3.5 h-3.5" /> : step.id}
                </div>
                <span
                  className={`text-xs font-medium truncate hidden sm:block ${
                    active ? "text-white" : done ? "text-gray-300" : "text-gray-500"
                  }`}
                >
                  {step.label}
                  {step.id === 1 && <span className="text-red-400 ml-0.5">*</span>}
                </span>
              </div>
              {i < CAMPAIGN_WIZARD_STEPS.length - 1 && (
                <div
                  className={`flex-1 h-px mx-3 min-w-[12px] ${
                    done ? "nv-wizard-step-line-done bg-[#5b5bf6]/60" : "nv-wizard-step-line-pending bg-white/[.10]"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
