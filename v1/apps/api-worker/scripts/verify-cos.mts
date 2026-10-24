/**
 * COS 预签名对拍：同一时间戳下，TS 与 Python 的签名必须完全一致。
 *
 * 签名错一个字节，COS 只回 `SignatureDoesNotMatch`，不会告诉你哪里错。
 * 所以先在本地把两边算出来的 URL 逐字符比对，再谈上线。
 */
import { cosPresignPut } from "../src/lib/cos.ts";

const bucket = process.env.COS_BUCKET_NAME ?? "";
const region = process.env.COS_REGION ?? "";
const secretId = process.env.COS_SECRET_ID ?? "";
const secretKey = process.env.COS_SECRET_KEY ?? "";
const key = process.env.COS_TEST_KEY ?? "uploads/test/uuid/abc.jpg";
const nowSec = Number(process.env.COS_TEST_NOW ?? "0");

const url = await cosPresignPut({ bucket, region, secretId, secretKey, key, expires: 900, nowSec });
console.log(url);
