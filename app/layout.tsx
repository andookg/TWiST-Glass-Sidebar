import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TWiST Glass Sidebar — Live Podcast AI Companion",
  description:
    "A live podcast companion with browser audio capture, realtime transcription, and AI persona bubbles. Captures audio, transcribes speech, routes to five AI personas, and generates social clips.",
  keywords: [
    "podcast",
    "AI",
    "live transcription",
    "sidebar",
    "OpenAI Realtime",
    "persona",
    "clip studio",
  ],
  authors: [{ name: "TWiST Glass Sidebar" }],
  openGraph: {
    title: "TWiST Glass Sidebar — Live Podcast AI Companion",
    description:
      "Real-time AI-powered podcast enhancement with five persona workers, clip generation, and agent handoff.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
