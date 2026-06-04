"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-[#0d0e14] text-white p-6">
      <div className="text-center max-w-md">
        <p className="text-gray-400 text-sm mb-6">Ocurrió un error al cargar esta página.</p>
        <button
          onClick={reset}
          className="px-6 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors"
        >
          Intentar de nuevo
        </button>
      </div>
    </div>
  );
}
