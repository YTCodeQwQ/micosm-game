import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);

  return {
    metadataBase,
    title: "Micosm Game | Board & Logic",
    description: "现代棋类与逻辑游戏平台。",
    icons: {
      icon: "/micosm-logo.png",
      shortcut: "/micosm-logo.png",
    },
    openGraph: {
      title: "Micosm Game | Board & Logic",
      description: "围棋、五子棋与黑白棋多人对战平台。",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "Micosm Game | Board & Logic",
      description: "围棋、五子棋与黑白棋多人对战平台。",
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
