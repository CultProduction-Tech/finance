import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: "Дашборд Техно Холдинг",
  description: "Финансовый дашборд Техно Холдинга",
  openGraph: {
    title: "Дашборд Техно Холдинг",
    description: "Финансовый дашборд Техно Холдинга",
    siteName: "Дашборд Техно Холдинг",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      className={`${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
