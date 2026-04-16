import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Liquity v2 Savings Calculator",
  description: "See how much you could save by migrating your borrow positions to Liquity v2",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} min-h-screen antialiased`} style={{ background: "#1a1a1a", color: "#e8e8e6" }}>
        {children}
      </body>
    </html>
  );
}
