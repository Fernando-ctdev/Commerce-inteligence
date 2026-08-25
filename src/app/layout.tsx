import type { Metadata } from "next";
import { Instrument_Sans } from "next/font/google";

import "./globals.css";

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
});

export const metadata: Metadata = {
  title: "Commerce Intelligence",
  description: "Planejamento comercial para creators.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={instrumentSans.variable}>{children}</body>
    </html>
  );
}
