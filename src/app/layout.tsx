import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "GTA Vice Metropolis 3D",
  description: "Mobil odaklı 3D açık dünya oyunu. Chrome'da tam ekran yatay modda oynayın.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Vice Metropolis" },
  other: { "mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  interactiveWidget: "overlays-content",
  themeColor: "#000000",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr" className="dark h-full bg-black">
      <body className="h-full w-full overflow-hidden bg-neutral-950 text-white antialiased select-none">
        {children}
      </body>
    </html>
  );
}
