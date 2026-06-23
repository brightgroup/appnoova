"use client";

/** Avatar premium — plano, navy + inicial periwinkle (como referencia UI). */
export const PREMIUM_AVATAR_BG = "#243048";
export const PREMIUM_AVATAR_INITIAL = "#8FA4E8";

type AvatarMode = "idle" | "connecting" | "listening" | "speaking";

interface PremiumVoiceAvatarProps {
  initial: string;
  mode?: AvatarMode;
}

export function PremiumVoiceAvatar({ initial }: PremiumVoiceAvatarProps) {
  return (
    <div className="relative flex items-center justify-center w-[76px] h-[76px]">
      <div
        className="w-[64px] h-[64px] rounded-full flex items-center justify-center shadow-[0_0_18px_rgba(143,164,232,0.14)]"
        style={{ backgroundColor: PREMIUM_AVATAR_BG }}
      >
        <span
          className="text-[1.5rem] font-semibold leading-none select-none tracking-[-0.02em]"
          style={{ color: PREMIUM_AVATAR_INITIAL }}
        >
          {initial}
        </span>
      </div>
    </div>
  );
}
