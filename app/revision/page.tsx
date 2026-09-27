import type { Metadata } from "next";
import ReviewWorkspace from "./review-workspace";

export const metadata: Metadata = {
  title: "Revisión de pantallas · Condomio MVP",
  description: "Tablero visual para revisar las pantallas del MVP de la red comercial de Condomio.",
  robots: { index: false, follow: false },
};

export default function RevisionPage() {
  return <ReviewWorkspace />;
}
