import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Runway | How can I afford this by this date?",
  description:
    "Runway helps people turn a goal, price, and deadline into a realistic affordability plan.",
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
