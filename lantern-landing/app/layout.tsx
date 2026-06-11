import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Byable — Find the best flight, not just the cheapest one",
  description:
    "Byable compares price, layovers, timing, airlines, airports, and comfort to explain which flight is actually worth booking.",
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
