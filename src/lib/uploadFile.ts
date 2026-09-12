// Asks our API for a presigned R2 upload URL, then PUTs the file
// directly to R2 from the browser. Returns the public URL to store in Supabase.
export async function uploadFile(file: File | Blob, filename: string, folder: "images" | "fonts" | "audio" | "thumbnails") {
  const contentType = (file as File).type || "application/octet-stream";

  const res = await fetch("/api/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, contentType, folder })
  });

  if (!res.ok) {
    throw new Error("업로드 URL 발급 실패");
  }

  const { uploadUrl, publicUrl } = await res.json();

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: file
  });

  if (!putRes.ok) {
    throw new Error("파일 업로드 실패");
  }

  return publicUrl as string;
}

// Resizes an image client-side (canvas) so admin grids only ever download
// a small preview instead of the full-resolution original. This is what
// actually fixes the "여러 장 올리면 버벅임" slowdown — the original still
// gets uploaded in full quality for the TV screens, but every admin page
// that shows a grid of thumbnails loads the small copy instead.
async function makeThumbnail(file: File, maxDim = 480, quality = 0.75): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("캔버스를 사용할 수 없습니다");
  ctx.drawImage(bitmap, 0, 0, w, h);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("썸네일 생성 실패"))), "image/jpeg", quality);
  });
}

// Uploads both the full-resolution original and a small thumbnail for an
// image library entry. Falls back to using the original as its own
// thumbnail if thumbnail generation fails for any reason (e.g. unusual
// file type) — upload still succeeds either way.
export async function uploadImageWithThumbnail(file: File) {
  const url = await uploadFile(file, file.name, "images");

  let thumbnailUrl = url;
  try {
    const thumbBlob = await makeThumbnail(file);
    thumbnailUrl = await uploadFile(thumbBlob, `thumb-${file.name.replace(/\.[^.]+$/, "")}.jpg`, "thumbnails");
  } catch {
    // non-fatal — the grid just falls back to the full image
  }

  return { url, thumbnailUrl };
}
