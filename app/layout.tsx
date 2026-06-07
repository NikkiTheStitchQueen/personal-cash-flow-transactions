import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Transactions | Personal Cash Flow",
  description: "Manual local-first transaction tracking"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
