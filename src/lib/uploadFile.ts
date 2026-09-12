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
async function makeThumbnail(file: File, maxDim = 360, quality = 0.7): Promise<Blob> {
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

// Uploading many files one at a time (await in a for-loop) means each
// file's full round trip (thumbnail + original, two R2 PUTs) blocks the
// next file from starting — that serial wait is a big part of what makes
// "여러 장 올리기" feel slow. This runs a small worker pool instead, so
// several files upload at once. `onEach` fires as soon as each file
// finishes (not necessarily in the original order), so the caller can
// insert into Supabase and update progress incrementally.
export async function uploadImagesWithThumbnails(
  files: File[],
  onEach: (result: { file: File; url: string; thumbnailUrl: string }) => void | Promise<void>,
  concurrency = 3
) {
  const queue = [...files];

  async function worker() {
    while (queue.length > 0) {
      const file = queue.shift();
      if (!file) return;
      const { url, thumbnailUrl } = await uploadImageWithThumbnail(file);
      await onEach({ file, url, thumbnailUrl });
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));
}

// For images uploaded before thumbnails existed (thumbnail_url is null):
// fetches the already-uploaded original back down, makes a thumbnail from
// it, and uploads just that — no need to re-upload the original again.
export async function backfillThumbnail(url: string, filename: string) {
  const res = await fetch(url);
  const blob = await res.blob();
  const file = new File([blob], filename, { type: blob.type || "image/jpeg" });
  const thumbBlob = await makeThumbnail(file);
  return uploadFile(thumbBlob, `thumb-${filename.replace(/\.[^.]+$/, "")}.jpg`, "thumbnails");
}

export async function backfillThumbnailsInBatches(
  items: { id: string; url: string; filename: string }[],
  onEach: (result: { id: string; thumbnailUrl: string | null }) => void | Promise<void>,
  concurrency = 3
) {
  const queue = [...items];

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) return;
      try {
        const thumbnailUrl = await backfillThumbnail(item.url, item.filename);
        await onEach({ id: item.id, thumbnailUrl });
      } catch {
        await onEach({ id: item.id, thumbnailUrl: null });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}
