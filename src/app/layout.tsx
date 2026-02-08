import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import { cn } from "@/utils";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";

// Local fonts via npm packages (no next/font/google network fetch)
import "@fontsource-variable/inter";
import "@fontsource-variable/eb-garamond";

export const metadata: Metadata = {
  title: "jStack App",
  description: "Created using jStack",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body
          className={cn(
            "min-h-[calc(100vh-1px)] flex flex-col bg-brand-50 text-brand-950 antialiased"
          )}
          style={{
            // keep same intent as your old CSS variables
            ["--font-sans" as any]: '"Inter Variable", "Inter", system-ui, sans-serif',
            ["--font-heading" as any]:
              '"EB Garamond Variable", "EB Garamond", Georgia, serif',
            fontFamily: "var(--font-sans)",
          }}
        >
          <main className="relative flex-1 flex flex-col">
            <Providers>{children}</Providers>
          </main>
        </body>
      </html>
    </ClerkProvider>
  );
}
