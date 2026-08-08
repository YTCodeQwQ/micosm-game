import type { Metadata, Viewport } from "next";
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#e8f0f7",
};

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = (requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000").split(",", 1)[0].trim();
  const hostname = host.startsWith("[") ? host.slice(1, host.indexOf("]")) : host.split(":", 1)[0];
  const isLocalHost = hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "::1"
    || hostname.startsWith("10.")
    || hostname.startsWith("192.168.")
    || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
  const protocol = requestHeaders.get("x-forwarded-proto")?.split(",", 1)[0].trim() || (isLocalHost ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);

  return {
    metadataBase,
    title: "Micosm Game | Board & Logic",
    description: "现代棋类与逻辑游戏平台。",
    applicationName: "Micosm Game",
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: "Micosm Game",
    },
    formatDetection: { telephone: false },
    icons: {
      icon: "/micosm-logo.png",
      shortcut: "/micosm-logo.png",
      apple: "/micosm-app-icon-192.png",
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
