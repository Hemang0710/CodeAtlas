import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Map } from "lucide-react";
import { Providers } from "@/components/providers";
import { ThemeToggle } from "@/components/theme-toggle";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "CodeAtlas",
    template: "%s · CodeAtlas",
  },
  description:
    "Ask any GitHub repository a question and get an AI-powered answer with cited code references.",
  openGraph: {
    title: "CodeAtlas",
    description:
      "Ask any GitHub repository a question and get an AI-powered answer with cited code references.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Providers>
          <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/80 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/80">
            <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
              <Link
                href="/"
                className="flex items-center gap-2 font-semibold tracking-tight hover:opacity-80 transition-opacity"
              >
                <Map className="h-5 w-5 text-amber-500" />
                <span>CodeAtlas</span>
              </Link>

              <nav className="flex items-center gap-2">
                <ThemeToggle />
                <a
                  href="https://github.com/Hemang0710/CodeAtlas"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                >
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="h-4 w-4 fill-current"
                  >
                    <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
                  </svg>
                  <span className="hidden sm:inline">GitHub</span>
                </a>
              </nav>
            </div>
          </header>

          <main className="flex-1 flex flex-col">
            {children}
          </main>

          <footer className="border-t border-zinc-200 dark:border-zinc-800 py-6 mt-auto">
            <div className="mx-auto max-w-5xl px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-500">
              <p>
                Built with{" "}
                <a
                  href="https://nextjs.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-100"
                >
                  Next.js
                </a>
                {" · "}
                <a
                  href="https://supabase.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-100"
                >
                  Supabase
                </a>
                {" · "}
                <a
                  href="https://ai.google.dev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-100"
                >
                  Gemini
                </a>
              </p>
              <p>Open source · Hemang</p>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
