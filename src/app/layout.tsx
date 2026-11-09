import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { StoreProvider } from "@/lib/store";

export const metadata: Metadata = {
  title: "Школьный компоновщик расписания",
  description:
    "Автономный составитель школьного расписания: база классов, педагогов, кабинетов и предметов, автоматическая генерация уроков и подстановка замен.",
};

export const viewport: Viewport = {
  themeColor: "#f3f6f5",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            if (localStorage.getItem("school-schedule-theme") === "dark") {
              document.documentElement.dataset.theme = "dark";
            }
          } catch {}
        ` }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-shell text-chalk antialiased">
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
