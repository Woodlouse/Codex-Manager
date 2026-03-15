import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 暂时禁用 Beta 版编译器以确保稳定性
  reactCompiler: false,
  output: 'export',
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
