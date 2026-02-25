import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Better Scraper",
  description: "Extract head lice clinics from Google Places",
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
