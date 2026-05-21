import { Metadata } from "next"
import { notFound } from "next/navigation"

export const metadata: Metadata = {
  title: "上传中...",
}

export default function UploadStatusPage() {
  notFound()
}
