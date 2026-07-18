// Loader de marca reutilizado en Splash y en cualquier carga dentro de la
// app (lista de chats, abrir una conversación, asignar/devolver a la IA) —
// mismo logo + puntitos en todos lados para que se sienta consistente.
export function AppLoader() {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="brand-logo lg" src="/logo-noova-white.webp" alt="Noova360" />
      <div className="dots">
        <i />
        <i />
        <i />
      </div>
    </>
  );
}
