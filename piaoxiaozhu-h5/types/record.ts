export interface RecordItem {
  id: string;
  direction: string;
  merchantName: string | null;
  amount: number;
  categoryCode: string;
  categoryL1: string;
  invoiceDate: string | null;
}

export interface RecordForReport {
  direction: string;
  amount: number;
  categoryCode: string;
  invoiceDate: string | null;
}
