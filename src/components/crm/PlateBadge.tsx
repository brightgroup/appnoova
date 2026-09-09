/** Placa de vehículo estilo tarjeta colombiana — usada en leads de seguros con ramo auto. */
export function PlateBadge({ plate, className = "" }: { plate: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border-2 border-black bg-[#f7d117] px-1.5 py-0.5 font-mono text-[11px] font-bold tracking-wider text-black ${className}`}
    >
      {plate.toUpperCase()}
    </span>
  );
}
