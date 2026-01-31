import type { Metadata } from "next";
import { Noto_Sans_TC } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const notoSansTC = Noto_Sans_TC({
  variable: "--font-noto-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "PTCG CardDB - Admin",
  description: "Pokemon TCG Card Database Management System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-HK">
      <body
        className={`${notoSansTC.variable} antialiased bg-gray-50`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
