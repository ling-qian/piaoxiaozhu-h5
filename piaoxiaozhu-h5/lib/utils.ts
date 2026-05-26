import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatAmount(amount: number): string {
  return (Number(amount) || 0).toFixed(2);
}

export function parseAmountInput(input: string): number {
  const val = parseFloat(input);
  if (isNaN(val)) return 0;
  return Math.round(val * 100) / 100;
}

export function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.9) return "#52C41A";
  if (confidence >= 0.7) return "#FAAD14";
  return "#FF4D4F";
}

export function getConfidenceText(confidence: number): string {
  if (confidence >= 0.9) return "高";
  if (confidence >= 0.7) return "中";
  return "低";
}

export function getConfidenceHint(confidence: number): string {
  if (confidence >= 0.9) return "识别结果较准确，可直接保存";
  if (confidence >= 0.7) return "建议核对后再保存";
  return "识别结果可能不准确，请仔细核对";
}

export function getDirectionColor(direction: string): string {
  return direction === "income" ? "#52C41A" : "#FF4D4F";
}

export function getDirectionPrefix(direction: string): string {
  return direction === "income" ? "+" : "-";
}
