import webpush from "web-push";

let configured = false;

export function pushConfigured() {
  return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function getWebPush() {
  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:admin@example.com",
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    );
    configured = true;
  }
  return webpush;
}

export type StoredSub = { endpoint: string; p256dh: string; auth: string };

export async function sendPush(sub: StoredSub, payload: { title: string; body: string; tag?: string; url?: string }) {
  const wp = getWebPush();
  return wp.sendNotification(
    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    JSON.stringify(payload),
    { TTL: 300, urgency: "high" }
  );
}

export function isGone(e: any) {
  return e && (e.statusCode === 404 || e.statusCode === 410);
}
