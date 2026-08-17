import type { NextConfig } from "next";

const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:8787";

const nextConfig: NextConfig = {
	basePath: "/admin",
	typescript: { ignoreBuildErrors: true },
	transpilePackages: ["@resume/ui"],
	async rewrites() {
		return [
			{
				source: "/api/:path*",
				destination: `${API_ORIGIN}/api/:path*`,
				basePath: false,
			},
		];
	},
	async redirects() {
		return [
			{
				source: "/",
				destination: "/admin",
				basePath: false,
				permanent: false,
			},
		];
	},
};

export default nextConfig;
