import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:8787";

const nextConfig: NextConfig = {
	typescript: { ignoreBuildErrors: true },
	allowedDevOrigins: ["172.20.10.2"],
	transpilePackages: ["@resume/ui", "@resume/shared"],
	serverExternalPackages: [
	  "pdfjs-dist",
	  "@napi-rs/canvas",
	],
	async rewrites() {
		return [
			{
				source: "/api/:path*",
				destination: `${API_ORIGIN}/api/:path*`,
			},
		];
	},
};

// Enable calling `getCloudflareContext()` in `next dev`.
// See https://opennext.js.org/cloudflare/bindings#local-access-to-bindings.
if (process.env.NODE_ENV === "development") {
	initOpenNextCloudflareForDev().catch(() => {
		// Cloudflare API 不可用时（比如没有配置 token），静默跳过
	});
}

export default nextConfig;
