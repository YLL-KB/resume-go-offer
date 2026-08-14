import type { NextConfig } from "next";

const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:8787";

const nextConfig: NextConfig = {
	typescript: { ignoreBuildErrors: true },
	transpilePackages: ["@resume/ui"],
	async rewrites() {
		return [
			{
				source: "/api/:path*",
				destination: `${API_ORIGIN}/api/:path*`,
			},
		];
	},
};

export default nextConfig;
