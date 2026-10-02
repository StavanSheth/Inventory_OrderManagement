import type { Metadata } from "next";
import type { CSSProperties } from "react";
import "./globals.css";
import "@/site/fonts";
import "@/site/site.css";
import { meta, theme } from "@/site/site";

const ICON = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="16" fill="#ffc2d4"/><path d="M11.5 16 16 28l4.5-12Z" fill="#e9b170"/><circle cx="16" cy="13" r="7" fill="#d61c5d"/></svg>',
)}`;

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  icons: {
    icon: ICON,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const t = theme;
  const isDark = (hex: string) => {
    const n = parseInt(hex.replace("#", "").slice(0, 6), 16);
    return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 < 140;
  };
  const vars = {
    "--bg": t.bg,
    "--surface": t.surface,
    "--text": t.text,
    "--muted": t.muted,
    "--accent": t.accent,
    "--accent-text": t.accentText,
    "--line": t.line,
    "--hero-text": t.heroText ?? (isDark(t.bg) ? t.text : "#fbf8f3"),
    "--radius": `${t.radius ?? 0}px`,
    "--font-display-family": t.fontDisplay,
    "--font-body-family": t.fontBody,
    "--heading-case": t.uppercaseHeadings ? "uppercase" : "none",
    "--heading-tracking": t.uppercaseHeadings ? "0.04em" : "0.005em",
  } as CSSProperties;

  return (
    <html lang="en" style={vars}>
      <body className="grain">{children}</body>
    </html>
  );
}
