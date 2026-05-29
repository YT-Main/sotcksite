import type { Metadata } from "next";

import "./globals.css";

import Nav from "@/components/Nav";
import { AlertProvider } from "@/components/AlertProvider";
import { PortfolioProvider } from "@/components/PortfolioProvider";
import { WatchlistProvider } from "@/components/WatchlistProvider";

export const metadata: Metadata = {
  title: "Stock site",
  description: "Watchlists backed by Twelve Data",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-950">
        <WatchlistProvider>
          <AlertProvider>
            <PortfolioProvider>
              <Nav />
              <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
            </PortfolioProvider>
          </AlertProvider>
        </WatchlistProvider>
      </body>
    </html>
  );
}
