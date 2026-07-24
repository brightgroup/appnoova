// Loader de marca reutilizado en Splash y en cargas dentro de /m —
// fondo oscuro → logo claro (noova 360 nuevo).
export function AppLoader() {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="brand-logo lg"
        src="/logo-noova-white.webp"
        alt="Noova 360"
        width={140}
        height={30}
      />
      <div className="dots">
        <i />
        <i />
        <i />
      </div>
    </>
  );
}
