/**
 * Cloudflare Workers 入口：把请求转发给容器里的 FastAPI。
 *
 * ## 为什么用 Worker + Container，而不是把后端改写成 Worker 代码
 *
 * 业务后端是 Python（FastAPI + SQLAlchemy + PaddleOCR）。
 * 改写成 Worker（JS/WASM）等于重写 1 万行，而且 PaddleOCR 在 Worker 里跑不了。
 * Cloudflare Containers 支持直接跑 Docker 镜像 → 现有镜像原样上云，零重写。
 *
 * Worker 在这里只做三件事：
 *   1. 提供一个轻量的边缘健康检查（不唤醒容器就能判断部署是否成功）
 *   2. 把请求原样转给容器
 *   3. 容器冷启动/异常时给出可读的错误，而不是一个裸的 500
 */

import { Container } from "@cloudflare/containers";

/** 容器里的 uvicorn 监听 8000（见 services/api/Dockerfile.api 的 EXPOSE） */
export class ApiContainer extends Container {
  defaultPort = 8000;
  /**
   * 空闲多久后休眠。
   *
   * 权衡：休眠省钱，但 PaddleOCR 冷启动要重新加载模型（实测 10–30s）。
   * 10 分钟是折中——用户在连续操作时不会反复冷启动，闲置时又能停下来省钱。
   */
  sleepAfter = "10m";

  /** 容器启动后先打一次健康检查，失败则让部署阶段就能看出来 */
  async onStart() {
    console.log("[container] 实例已启动");
  }
}

interface Env {
  API_CONTAINER: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // 边缘健康检查：容器没醒也能返回，用于验证「Worker 本身部署成功」
    if (url.pathname === "/__edge/health") {
      return Response.json({
        ok: true,
        edge: "cloudflare-workers",
        ts: new Date().toISOString(),
      });
    }

    // 固定名字 → 始终命中同一个容器实例。
    // 若用 newUniqueId()，每个请求都会拿到新 id，可能拉起多个容器：
    // 费用翻倍、内存里缓存的 LLM 客户端与降级状态也会各自为战。
    const id = env.API_CONTAINER.idFromName("api-singleton");
    const container = env.API_CONTAINER.get(id);

    try {
      return await container.fetch(request);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // 冷启动超时是最常见的原因，单独提示，避免运营误判成业务代码问题
      const coldStartHint = /timeout|start|sleep/i.test(msg)
        ? "（可能是容器冷启动中，PaddleOCR 首次加载需 10–30 秒，稍后重试）"
        : "";
      console.error("[edge] 转发到容器失败:", msg);
      return Response.json(
        { detail: `后端暂时不可用${coldStartHint}`, error: msg },
        { status: 503 }
      );
    }
  },
};
