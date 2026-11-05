import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the on-screen dev indicator so it doesn't show up during client demos.
  devIndicators: false,
  // 画像の最適化（/_next/image）はサーバーの中から画像を取りに行くため、Basic認証（proxy.ts）で止まってしまう
  // PoC では最適化せず、ブラウザが認証つきで public/ の画像を直接読む
  images: { unoptimized: true },
  // エージェントの指示文（prompts/）は実行時にファイルから読むので、戦略を作る API の関数に一緒に載せる（lib/agents/prompts.ts）
  // 入力画面の AI入力アシスト・間取り図の読み取り（サーバーアクション）も指示文を読むので、物件の画面にも載せる
  outputFileTracingIncludes: {
    "/api/properties/*/strategy": ["./prompts/**"],
    "/api/properties/*/strategy/prompts": ["./prompts/**"],
    "/properties/**": ["./prompts/**"],
  },
  // 物件の画像（最大3枚）を保存のサーバーアクションで送る。画面で1枚 IMAGE_SEND_BYTES（1.4MB）までに縮めるので、3枚でも Vercel の上限（4.5MB）に収まる
  experimental: { serverActions: { bodySizeLimit: "4.5mb" } },
  // トップの画面は持たず、物件一覧へ送る。アクセス制限は Basic認証（proxy.ts）
  async redirects() {
    return [{ source: "/", destination: "/properties", permanent: false }];
  },
};

export default nextConfig;
