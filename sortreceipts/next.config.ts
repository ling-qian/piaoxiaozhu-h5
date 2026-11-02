import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.public.blob.vercel-storage.com",
      },
    ],
    formats: ["image/avif", "image/webp"],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  // 性能优化：压缩 + 缓存头
  compress: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            // 站点只走 HTTPS，浏览器记住这个决定，避免降级到明文
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            // 跨站跳转时只带来源域名，不带完整路径和查询串
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            // 只用得到摄像头（拍照上传票据），其余一概不给
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=()",
          },
          {
            // 只声明防嵌入，不限制脚本与样式：整站内联样式很多，
            // 贸然上完整 CSP 会把页面白屏
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'",
          },
        ],
      },
      {
        // 静态资源长期缓存（Next.js 自动加 hash）
        source: "/_next/static/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        // 图片资源缓存
        source: "/(.*)\\.(png|jpg|jpeg|gif|svg|ico|webp|avif)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
