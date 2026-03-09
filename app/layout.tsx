import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Errordex — CI/CD Failure Encyclopedia",
  description: "Find fixes for exact CI/CD error strings. Indexed by runner, toolchain, and provider. Built for engineers debugging at 2am.",
  verification: {
   google: "NXlow4Yja_F5bTy6KV0052IwXpIMsBcOptHPkcwbb58",
  },
  openGraph: {
    title: "Errordex — CI/CD Failure Encyclopedia",
    description: "Find fixes for exact CI/CD error strings. GitHub Actions, GitLab CI, Docker, Node.js and more.",
    url: "https://errordex.dev",
    siteName: "Errordex",
  },
};
```

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
