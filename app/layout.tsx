import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Stop overpaying for your loan",
  description: "Paste your address and see how much you could save by migrating borrow positions to Liquity v2.",
  openGraph: {
    title: "Stop overpaying for your loan",
    description: "Paste your address and see how much you could save by migrating borrow positions to Liquity v2.",
    type: "website",
    images: [{ url: "https://rate-comparooor.vercel.app/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Stop overpaying for your loan",
    description: "Paste your address and see how much you could save by migrating borrow positions to Liquity v2.",
    images: ["https://rate-comparooor.vercel.app/og-image.png"],
  },
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
