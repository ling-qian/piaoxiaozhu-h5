export interface RecordItem {
  id: string;
  direction: string;
  merchantName: string | null;
  amount: number;
  categoryCode: string;
  categoryL1: string;
  invoiceDate: string | null;
  invoiceType?: string | null;
  rawText?: string | null;
}

export interface RecordForReport {
  id: string;
  direction: string;
  merchantName: string | null;
  amount: number;
  categoryCode: string;
  categoryL1: string;
  categoryL2: string | null;
  invoiceDate: string | null;
  invoiceType?: string | null;
  invoiceNo?: string | null;
  rawText?: string | null;
}
