import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BAEN Community",
  description: "Profile creator for BAEN alumni and students",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="bg-maroon-700 text-white">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-baseline gap-3">
            <a href="/" className="text-xl font-bold tracking-wide">
              BAEN Community
            </a>
            <span className="hidden sm:inline text-sm text-maroon-100">
              Biological &amp; Agricultural Engineering · Texas A&amp;M University
            </span>
          </div>
        </header>
        {children}
        <footer className="border-t-4 border-maroon-700 bg-white py-4 text-center text-sm text-gray-600">
          Department of Biological &amp; Agricultural Engineering · Texas A&amp;M University
        </footer>
      </body>
    </html>
  );
}
