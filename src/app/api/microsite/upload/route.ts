import { NextRequest, NextResponse } from "next/server";
import {
  isAllowedMicrositeImage,
  type MicrositeAssetKind,
  uploadMicrositeAsset
} from "@/lib/microsite-storage";
import { textAgentsAdminClient, getTextAgentUserIdFromRequest } from "@/lib/text-agents-server";

export async function POST(req: NextRequest) {
  const userId = await getTextAgentUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  const kind = formData.get("kind");

  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: "Archivo inválido" }, { status: 400 });
  }

  if (kind !== "logo" && kind !== "favicon") {
    return NextResponse.json({ error: "Tipo de asset inválido" }, { status: 400 });
  }

  const contentType = file.type || "application/octet-stream";
  if (!isAllowedMicrositeImage(contentType)) {
    return NextResponse.json(
      { error: "Formato no permitido. Usa PNG, JPG, WebP, SVG o ICO." },
      { status: 400 }
    );
  }

  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "El archivo supera 5 MB" }, { status: 400 });
  }

  const db = textAgentsAdminClient();
  const buffer = Buffer.from(await file.arrayBuffer());
  const url = await uploadMicrositeAsset(db, userId, kind as MicrositeAssetKind, buffer, contentType);

  if (!url) {
    return NextResponse.json(
      { error: "No se pudo subir el archivo. Verifica la migración 015_microsite_assets_storage.sql" },
      { status: 503 }
    );
  }

  return NextResponse.json({ url, kind });
}
