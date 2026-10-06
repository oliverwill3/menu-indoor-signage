import "./globals.css";

export const metadata = {
  title: "Mídia Indoor",
  description: "Player de mídia indoor multi-tenant.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
