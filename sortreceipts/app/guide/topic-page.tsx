/**
 * 主题子文的页面工厂。
 *
 * 三个 slug 各自建一个路由文件，而不是用 `[slug]` 动态段：
 * 动态段在未知 slug 上由 `notFound()` 兜底，但当前部署会把它渲染成
 * 状态 200 的空壳页——爬虫会当成一篇没有正文的文章收进索引。
 * 静态路由不匹配就直接落到站点的 404，没有这个中间态。
 */

import type { Metadata } from "next";

import type { DocLocale } from "./content";
import { topicMetadata } from "./metadata";
import { topicStructuredData } from "./structured-data";
import { TopicView } from "./view";
import { topicBySlug } from "./topics";
import type { DocTopic } from "./topics";

/** 取主题并收窄类型。放在函数里返回，闭包里才拿得到确定的 `DocTopic` */
function requireTopic(slug: string): DocTopic {
  const topic = topicBySlug(slug);
  if (!topic) throw new Error(`未知的主题 slug: ${slug}`);
  return topic;
}

export function topicPageModule(slug: string, locale: DocLocale) {
  const topic = requireTopic(slug);

  const metadata: Metadata = topicMetadata(topic, locale);

  function Page() {
    return (
      <>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(topicStructuredData(topic, locale)) }}
        />
        <TopicView topic={topic} locale={locale} />
      </>
    );
  }

  return { metadata, Page };
}
