import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
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
	title: "Resume Go Offer — AI 简历生成与管理",
	description:
		"免费在线简历制作工具，支持多模板实时预览、版本管理、投递追踪，一键导出 PDF。",
	manifest: "/manifest.json",
	appleWebApp: {
		capable: true,
		title: "Resume Go Offer",
		statusBarStyle: "default",
	},
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="zh-CN">
			<head>
				<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
					<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
				<meta name="theme-color" content="#10b981" />
				<script src="/register-sw.js" defer />
			</head>
			<body
				className={`${geistSans.variable} ${geistMono.variable} antialiased`}
			>
				{children}
				<Toaster richColors position="top-center" />
			</body>
		</html>
	);
}
