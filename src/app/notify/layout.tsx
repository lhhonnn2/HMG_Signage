import "./notify.css";

export const metadata = {
  title: "HMG 알림",
  description: "프로그램 시작 알림 받기",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "HMG 알림", statusBarStyle: "default" as const }
};

export const viewport = { themeColor: "#002c5f", width: "device-width", initialScale: 1 };

export default function NotifyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
