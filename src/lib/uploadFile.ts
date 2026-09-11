// Asks our API for a presigned R2 upload URL, then PUTs the file
// directly to R2 from the browser. Returns the public URL to store in Supabase.
export async function uploadFile(file: File, folder: "images" | "fonts" | "audio") {
  const res = await fetch("/api/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type || "application/octet-stream",
      folder
    })
  });

  if (!res.ok) {
    throw new Error("업로드 URL 발급 실패");
  }

  const { uploadUrl, publicUrl } = await res.json();

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file
  });

  if (!putRes.ok) {
    throw new Error("파일 업로드 실패");
  }

  return publicUrl as string;
}
