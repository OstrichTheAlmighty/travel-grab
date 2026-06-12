import type { Metadata } from "next";
import "./globals.css";
import { BRAND_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: `${BRAND_NAME} — Find the best flight, not just the cheapest one`,
  description: `${BRAND_NAME} compares price, layovers, timing, airlines, airports, and comfort to explain which flight is actually worth booking.`,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
