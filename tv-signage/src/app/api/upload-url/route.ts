import { NextRequest, NextResponse } from "next/server";
import { createUploadUrl } from "@/lib/r2";

export async function POST(req: NextRequest) {
  const { filename, contentType, folder } = await req.json();

  if (!filename || !folder) {
    return NextResponse.json({ error: "filename, folder가 필요합니다" }, { status: 400 });
  }

  const safeName = filename.replace(/[^a-zA-Z0-9.\-_가-힣]/g, "_");
  const key = `${folder}/${Date.now()}-${safeName}`;

  const { uploadUrl, publicUrl } = await createUploadUrl(key, contentType || "application/octet-stream");

  return NextResponse.json({ uploadUrl, publicUrl });
}
