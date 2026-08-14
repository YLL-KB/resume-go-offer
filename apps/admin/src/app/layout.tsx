import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { AdminShell } from "@/components/admin-shell";
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
	title: "管理后台 — Resume Go Offer",
	description: "Resume Go Offer 管理后台",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="zh-CN" suppressHydrationWarning>
			<head>
				<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
				<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
				<meta name="theme-color" content="#10b981" />
			</head>
			<body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
				<AdminShell>{children}</AdminShell>
				<Toaster richColors position="top-center" />
			</body>
		</html>
	);
}
