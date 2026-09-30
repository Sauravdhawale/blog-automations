import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
    title: "Arkentech Content Studio",
    description: "Your editorial workspace for WordPress publishing.",
    icons: {
        icon: "/favicon.svg",
        shortcut: "/favicon.svg",
    },
};
export default function RootLayout({ children, }: Readonly<{
    children: React.ReactNode;
}>) {
    return (<html lang="en">
      <body className="antialiased">{children}</body>
    </html>);
}
