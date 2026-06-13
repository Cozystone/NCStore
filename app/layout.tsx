import type { Metadata, Viewport } from "next";
import { PwaRegister } from "@/components/pwa-register";
import { getEnv } from "@/lib/env";
import "./globals.css";

export const metadata: Metadata = {
  title: `${getEnv().publicAppName}`,
  description: "넥스트챌린지스쿨 매점 키오스크와 운영 대시보드",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: getEnv().publicAppName,
  },
};

export const viewport: Viewport = {
  themeColor: "#eff6ff",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className="tap-highlight">
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
