import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "VisitaPro",
  description: "Planeamento partilhado de clientes e visitas recorrentes",
  manifest: "/manifest.json",
};
export const viewport: Viewport = { themeColor: "#172554", width: "device-width", initialScale: 1 };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-PT"><body>{children}</body></html>;
}
