import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-page">
      <div className="text-center animate-fade-in-up">
        <div className="text-7xl font-bold text-brand/20 mb-2">404</div>
        <h2 className="text-lg font-semibold text-[#333333] mb-2">页面不存在</h2>
        <p className="text-sm text-[#999999] mb-6">
          你访问的页面可能已被移动或删除
        </p>
        <Link
          href="/"
          className="inline-block bg-brand text-white px-8 py-2.5 rounded-xl text-sm font-medium btn-press"
        >
          返回首页
        </Link>
      </div>
    </div>
  );
}
