"use client";

/**
 * Cloudflare Turnstile 的人机验证挂件。
 *
 * 真实用户大概率只会看到一个小方框，脚本则会卡在「跑完这段 JS」这一步。
 * 校验发生在服务端，这里产出的 token 只是一张一次性的票据，
 * 提交到后端后由后端去问 Cloudflare 是否有效。
 *
 * 站点 Key 没配时整个挂件不渲染，后端会明确报「人机验证未配置」，
 * 而不是让用户点一个永远不过的按钮。
 */

import { useEffect, useRef } from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: Record<string, unknown>,
      ) => string;
    };
  }
}

let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("turnstile load failed"));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export default function Turnstile({
  onToken,
  resetKey = 0,
}: {
  onToken: (token: string) => void;
  /** 值一变就重新渲染挂件。token 用过一次就失效，提交后靠它换一张新的 */
  resetKey?: number;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  // 用 ref 存回调：父组件每次渲染都会传新函数，直接放进依赖会让 effect 无限重跑
  const tokenRef = useRef(onToken);
  tokenRef.current = onToken;

  useEffect(() => {
    if (!SITE_KEY) {
      tokenRef.current("");
      return;
    }

    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !boxRef.current || !window.turnstile) return;
        boxRef.current.innerHTML = "";
        window.turnstile.render(boxRef.current, {
          sitekey: SITE_KEY,
          theme: "light",
          size: "flexible",
          callback: (token: string) => tokenRef.current(token),
          "expired-callback": () => tokenRef.current(""),
          "error-callback": () => tokenRef.current(""),
        });
      })
      .catch(() => tokenRef.current(""));

    return () => {
      cancelled = true;
    };
  }, [resetKey]);

  if (!SITE_KEY) return null;

  return <div ref={boxRef} className="flex justify-center" />;
}
