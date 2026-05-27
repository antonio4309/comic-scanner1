import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#ff8e3e",
};

export const metadata: Metadata = {
  title: "LongboxLens – Scan, Value & Sell Comics",
  description:
    "AI-powered comic book scanner with instant eBay UK valuations, CGC grade detection, and Whatnot CSV export.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
