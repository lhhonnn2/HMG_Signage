import "./globals.css";
import { Analytics } from '@vercel/analytics/next';

export const metadata = {
  title: "TV 사이니지 관리",
  description: "센터 TV 이미지 루핑 및 알람 방송 시스템"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
