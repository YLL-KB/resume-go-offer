import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
	serverExternalPackages: ["pdfjs-dist"],
};

// Enable calling `getCloudflareContext()` in `next dev`.
// See https://opennext.js.org/cloudflare/bindings#local-access-to-bindings.
if (process.env.NODE_ENV === "development") {
	initOpenNextCloudflareForDev().catch(() => {
		// Cloudflare API 不可用时（比如没有配置 token），静默跳过
	});
}

export default nextConfig;
