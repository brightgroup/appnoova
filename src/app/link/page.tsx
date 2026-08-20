import Link from "next/link";

export default function LinkSubdomainHomePage() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.noova360.com";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#f5f5f5] text-gray-800 px-6 text-center">
      <h1 className="text-2xl font-semibold mb-2">Noova Link</h1>
      <p className="text-sm text-gray-500 max-w-md mb-6">
        Este es el dominio de micrositios de chat para corredores de seguros.
        Accede al enlace personalizado que te compartió tu corredor.
      </p>
      <Link
        href={appUrl}
        className="text-sm font-medium text-[#0f7eff] hover:underline"
      >
        Ir a Noova 360 →
      </Link>
    </div>
  );
}
