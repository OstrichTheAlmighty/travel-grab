import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { BRAND_NAME } from "@/lib/brand";
import { AuthProvider } from "@/app/components/AuthProvider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: `${BRAND_NAME} — The travel advisor in your browser`,
  description: `Flights ranked by more than price. Hotels matched to your neighborhood. Itineraries built around geography. Reasoning behind every recommendation.`,
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-512.png",      sizes: "512x512", type: "image/png" },
    ],
    apple: { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: `(function(){var s=document.createElement("script");s.async=1;s.src='https://emrld.ltd/NTQzNTc4.js?t=543578';document.head.appendChild(s);})();` }} /></head><body className="antialiased"><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}
