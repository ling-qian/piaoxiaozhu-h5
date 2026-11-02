/**
 * 票据上传：签发预签名直传地址 + 登记已上传文件。
 *
 * 为什么让客户端直传对象存储，而不是经 Worker 中转：
 *   · Worker 的请求体要过一遍内存，2MB 图片 × 并发 = 很快撞内存与流量成本
 *   · 直传只需在小程序后台配置对象存储域名的 request 合法域名，不依赖自有域名
 *   · SecretKey 只留在服务端，客户端拿到的是有时效的 URL
 */
import { Hono } from "hono";

import type { Env } from "../env";
import type { UserRow } from "../db/types";
import { cosDeleteObject, cosObjectSize, cosPresignGet, cosPresignPut, cosPublicUrl } from "../lib/cos";
import { badRequest, isUuid, notFound, serverError } from "../lib/http";
import { nowIso } from "../lib/time";
import { assertHourlyLimit } from "../lib/rate-limit";

const router = new Hono<{ Bindings: Env; Variables: { user: UserRow } }>();

/** 票据图片只接受这些类型：不做校验的话，任意文件都能进对象存储 */
const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/heif": ".heif",
};
const ALLOWED_IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"]);

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_XML_BYTES = 5 * 1024 * 1024;
const MAX_OFD_BYTES = 20 * 1024 * 1024;

// 数电票归档：XML 是数据本体，OFD 是版式文件，两者都不做 OCR
const DOCUMENT_KIND_BY_MIME: Record<string, string> = {
  "text/xml": "xml",
  "application/xml": "xml",
  "application/ofd": "ofd",
};
const DOCUMENT_KIND_BY_EXT: Record<string, string> = { ".xml": "xml", ".ofd": "ofd" };

const UPLOAD_URL_TTL = 900;
/** 展示地址有效期：够用户看完一张票，又不至于被长期转发 */
const VIEW_URL_TTL = 3600;

/**
 * 判定内容类型与扩展名。
 *
 * 只靠 MIME 不可信（小程序/浏览器常给 application/octet-stream），
 * 所以 MIME 与扩展名两条路都认，任一路能确定就放行，都认不出才拒绝。
 */
function classifyUpload(filename: string, contentType: string): { kind: string; ext: string } {
  const dot = (filename || "").lastIndexOf(".");
  const ext = dot >= 0 ? filename.slice(dot).toLowerCase() : "";

  const imgExt = ALLOWED_IMAGE_TYPES[contentType];
  if (imgExt) return { kind: "image", ext: imgExt };

  const docKind = DOCUMENT_KIND_BY_MIME[contentType];
  if (docKind) {
    const knownExt = Object.entries(DOCUMENT_KIND_BY_EXT).some(([e, k]) => k === docKind && e === ext);
    return { kind: docKind, ext: knownExt ? ext : `.${docKind}` };
  }

  const byExt = DOCUMENT_KIND_BY_EXT[ext];
  if (byExt) return { kind: byExt, ext };

  if ((contentType === "" || contentType === "application/octet-stream") && ALLOWED_IMAGE_EXTS.has(ext)) {
    return { kind: "image", ext: ext === ".jpeg" ? ".jpeg" : ext };
  }

  throw badRequest("不支持的文件类型，请上传 JPG/PNG/WebP 图片，或数电票 XML/OFD");
}

function maxBytes(kind: string): number {
  if (kind === "xml") return MAX_XML_BYTES;
  if (kind === "ofd") return MAX_OFD_BYTES;
  return MAX_IMAGE_BYTES;
}

async function assertProjectOwner(db: D1Database, projectId: string, userId: string) {
  const row = await db
    .prepare("SELECT id FROM projects WHERE id = ? AND user_id = ?")
    .bind(projectId, userId)
    .first<{ id: string }>();
  if (!row) throw notFound("Project not found");
}

router.get("/files/upload-url", async (c) => {
  const u = c.get("user");
  const projectId = c.req.query("project_id") ?? "";
  const filename = c.req.query("filename") ?? "";
  const contentType = c.req.query("content_type") ?? "";

  if (!isUuid(projectId)) throw notFound("Project not found");
  await assertProjectOwner(c.env.DB, projectId, u.id);

  // 每签发一个地址，就是一次可能的大文件写入。按小时封顶，别让存储被刷。
  await assertHourlyLimit(c.env.DB, u.id, "file_upload_url", 40, "上传太频繁了，请稍后再试");

  const { kind, ext } = classifyUpload(filename, contentType);
  const max = maxBytes(kind);

  // 客户端报的 size 不是用来信任的，而是用来签 content-length：
  // 签进去多少字节，COS 就只接受多少字节，多传一个字节签名就不匹配。
  // 不传 size 的老客户端仍然可用，登记时会按对象实际大小再拒一次。
  const sizeRaw = c.req.query("size");
  let extraHeaders: Record<string, string> | undefined;
  if (sizeRaw !== undefined && sizeRaw !== "") {
    const size = Number(sizeRaw);
    if (!Number.isFinite(size) || size <= 0) throw badRequest("size 必须是正整数");
    if (size > max) throw badRequest(`文件超过 ${Math.floor(max / 1024 / 1024)}MB 上限`);
    extraHeaders = { "content-length": String(Math.trunc(size)) };
  }

  const { COS_SECRET_ID, COS_SECRET_KEY, COS_REGION, COS_BUCKET_NAME } = c.env;
  if (!COS_SECRET_ID || !COS_SECRET_KEY || !COS_REGION || !COS_BUCKET_NAME) {
    throw serverError("当前未配置对象存储，无法签发直传地址");
  }

  const fileId = crypto.randomUUID();
  const fileKey = `uploads/${u.id}/${projectId}/${fileId}${ext}`;

  const uploadUrl = await cosPresignPut({
    bucket: COS_BUCKET_NAME,
    region: COS_REGION,
    secretId: COS_SECRET_ID,
    secretKey: COS_SECRET_KEY,
    key: fileKey,
    expires: UPLOAD_URL_TTL,
    extraHeaders,
  });

  return c.json({
    file_id: fileId,
    file_key: fileKey,
    upload_url: uploadUrl,
    method: "PUT",
    expires_in: UPLOAD_URL_TTL,
    content_kind: kind,
    max_bytes: max,
    /** 为 true 时 PUT 必须带同样的 Content-Length，否则 COS 判签名不匹配 */
    size_locked: Boolean(extraHeaders),
  });
});

router.post("/files/register", async (c) => {
  const u = c.get("user");
  const body = await c.req.json<any>().catch(() => ({}));

  const projectId = String(body?.project_id ?? "");
  const fileId = String(body?.file_id ?? "");
  const fileKey = String(body?.file_key ?? "");
  const filename = String(body?.filename ?? "");
  const contentType = String(body?.content_type ?? "");

  if (!isUuid(projectId) || !isUuid(fileId)) throw notFound("Project not found");
  await assertProjectOwner(c.env.DB, projectId, u.id);

  if (!fileKey) throw badRequest("缺少 file_key");

  // 归属校验：key 必须落在「本人 + 本项目」的目录下。
  // 不校验的话，用户可以把别人的对象路径登记进自己的项目。
  const expectedPrefix = `uploads/${u.id}/${projectId}/${fileId}`;
  if (!fileKey.startsWith(expectedPrefix)) {
    throw badRequest("file_key 与登记的文件不匹配");
  }

  const { COS_BUCKET_NAME, COS_REGION, COS_SECRET_ID, COS_SECRET_KEY } = c.env;
  if (!COS_BUCKET_NAME || !COS_REGION || !COS_SECRET_ID || !COS_SECRET_KEY) {
    throw serverError("当前未配置对象存储");
  }

  // 每次登记都要回源 HEAD 一次，次数同样要封顶
  await assertHourlyLimit(c.env.DB, u.id, "file_register", 60, "上传太频繁了，请稍后再试");

  const { kind } = classifyUpload(filename || fileKey, contentType);
  const max = maxBytes(kind);

  // 以存储里的真实大小为准。客户端报多少、预签名 URL 是否被重放都不作数：
  // 回源读到的字节数超过上限，就删掉对象并拒绝登记。
  const head = await cosObjectSize({
    bucket: COS_BUCKET_NAME,
    region: COS_REGION,
    secretId: COS_SECRET_ID,
    secretKey: COS_SECRET_KEY,
    key: fileKey,
  });
  if (!head.exists) throw badRequest("文件还没上传成功，请重试");
  if (head.size === null) throw badRequest("无法确认文件大小，请重新上传");
  if (head.size <= 0) {
    await cosDeleteObject({
      bucket: COS_BUCKET_NAME,
      region: COS_REGION,
      secretId: COS_SECRET_ID,
      secretKey: COS_SECRET_KEY,
      key: fileKey,
    });
    throw badRequest("文件内容为空，请重新上传");
  }
  if (head.size > max) {
    await cosDeleteObject({
      bucket: COS_BUCKET_NAME,
      region: COS_REGION,
      secretId: COS_SECRET_ID,
      secretKey: COS_SECRET_KEY,
      key: fileKey,
    });
    throw badRequest(`文件超过 ${Math.floor(max / 1024 / 1024)}MB 上限，已拒绝`);
  }

  const fileUrl = cosPublicUrl(COS_BUCKET_NAME, COS_REGION, fileKey);
  const ts = nowIso();

  await c.env.DB.prepare(
    `INSERT INTO invoice_files
       (id, project_id, user_id, file_url, file_key, source, ocr_status, parse_status, created_at, file_hash, content_kind)
     VALUES (?, ?, ?, ?, ?, 'upload', 'pending', 'pending', ?, NULL, ?)`
  )
    .bind(fileId, projectId, u.id, fileUrl, fileKey, ts, kind)
    .run();

  // 桶是私有读，file_url（公开地址）只能存档，展示必须用签名地址
  const viewUrl = await cosPresignGet({
    bucket: COS_BUCKET_NAME,
    region: COS_REGION,
    secretId: COS_SECRET_ID,
    secretKey: COS_SECRET_KEY,
    key: fileKey,
    expires: VIEW_URL_TTL,
  });

  return c.json(
    {
      id: fileId,
      project_id: projectId,
      file_url: fileUrl,
      file_key: fileKey,
      // 前端 <Image src> 用这个；有效期 1 小时，过期重新调 /files/:id/url
      view_url: viewUrl,
      content_kind: kind,
      ocr_status: "pending",
      // Worker 里没有 Celery，OCR 由客户端调 /api/ocr/recognize 同步触发
      next: "/api/ocr/recognize",
    },
    201
  );
});

router.get("/files/:id/url", async (c) => {
  const u = c.get("user");
  const fileId = c.req.param("id");
  if (!isUuid(fileId)) throw notFound("File not found");

  const row = await c.env.DB.prepare(
    "SELECT file_key FROM invoice_files WHERE id = ? AND user_id = ?"
  )
    .bind(fileId, u.id)
    .first<{ file_key: string }>();
  if (!row) throw notFound("File not found");

  if (!c.env.COS_BUCKET_NAME || !c.env.COS_REGION || !c.env.COS_SECRET_ID || !c.env.COS_SECRET_KEY) {
    throw serverError("当前未配置对象存储");
  }

  const url = await cosPresignGet({
    bucket: c.env.COS_BUCKET_NAME,
    region: c.env.COS_REGION,
    secretId: c.env.COS_SECRET_ID,
    secretKey: c.env.COS_SECRET_KEY,
    key: row.file_key,
    expires: VIEW_URL_TTL,
  });
  return c.json({ url, expires_in: VIEW_URL_TTL });
});

export default router;
