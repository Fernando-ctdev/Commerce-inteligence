import type { Metadata } from "next";
import { Geist_Mono, Instrument_Sans } from "next/font/google";

import "./globals.css";
import { cn } from "@/lib/utils";

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "Commerce Intelligence",
  description: "Planejamento comercial para creators.",
};

// Light é o padrão (DESIGN, princípio 11); aplica a preferência local antes da pintura para evitar flash.
const themeInitScript = 'try{document.documentElement.classList.toggle("dark",localStorage.getItem("ci-theme")==="dark")}catch(e){}';

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={cn(instrumentSans.variable, geistMono.variable, "font-sans")} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
