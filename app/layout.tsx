import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vade Mecum Pessoal",
  description: "Leitura de legislação com destaques, remissões e atualização de fontes oficiais.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
