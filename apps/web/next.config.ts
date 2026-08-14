import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:8787";

const nextConfig: NextConfig = {
	typescript: { ignoreBuildErrors: true },
	allowedDevOrigins: ["172.20.10.2"],
	transpilePackages: ["@resume/ui", "@resume/shared"],
	// SSE 流式输出必须禁用 gzip：Next 的 compression 中间件会缓冲 text/event-stream，
	// 导致浏览器要等响应全部结束才一次性收到数据，无法逐字渲染。
	compress: false,
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
