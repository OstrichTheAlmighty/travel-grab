import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lantern | How can I afford this by this date?",
  description:
    "See the path to what you want. Lantern helps you understand how to afford a goal by a target date.",
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
