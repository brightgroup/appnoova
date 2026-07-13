import { redirect } from "next/navigation";

/** app.noova360.com → ingreso a la plataforma (landing vive en noova360.com). */
export default function HomePage() {
  redirect("/login");
}
