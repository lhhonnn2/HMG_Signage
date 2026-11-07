// Friendly labels for the subscriptions list (admin only).
export function describeUA(ua: string | null | undefined): { device: string; browser: string } {
  const u = ua || "";
  let device = "기타";
  if (/iPad/.test(u)) device = "아이패드";
  else if (/iPhone|iPod/.test(u)) device = "아이폰";
  else if (/Android/.test(u)) device = "안드로이드";
  else if (/Windows/.test(u)) device = "Windows PC";
  else if (/Macintosh|Mac OS X/.test(u)) device = "Mac";

  let browser = "기타";
  if (/SamsungBrowser/.test(u)) browser = "삼성 인터넷";
  else if (/EdgA|EdgiOS|Edg\//.test(u)) browser = "엣지";
  else if (/OPR\/|Opera/.test(u)) browser = "오페라";
  else if (/FxiOS|Firefox/.test(u)) browser = "파이어폭스";
  else if (/CriOS|Chrome\//.test(u)) browser = "크롬";
  else if (/Safari\//.test(u)) browser = "Safari";
  else if (/iPhone|iPad|iPod/.test(u)) browser = "홈 화면 앱"; // iOS home-screen apps send no "Safari/" token
  return { device, browser };
}

export function pushServiceLabel(endpoint: string | null | undefined): string {
  let host = "";
  try {
    host = new URL(endpoint || "").host;
  } catch {
    return "?";
  }
  if (host.endsWith("fcm.googleapis.com")) return "구글";
  if (host.endsWith("push.apple.com")) return "애플";
  if (host.endsWith("notify.windows.com")) return "마이크로소프트";
  if (host.endsWith("push.services.mozilla.com")) return "모질라";
  return host;
}
