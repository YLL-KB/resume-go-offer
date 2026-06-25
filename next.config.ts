import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
	serverExternalPackages: ["pdfjs-dist"],
};

// Enable calling `getCloudflareContext()` in `next dev`.
// See https://opennext.js.org/cloudflare/bindings#local-access-to-bindings.
if (process.env.NODE_ENV === "development") {
	initOpenNextCloudflareForDev();
}

export default nextConfig;
