import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Acceso comercial · Condomio",
  description: "Portal de la red comercial independiente de Condomio.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
