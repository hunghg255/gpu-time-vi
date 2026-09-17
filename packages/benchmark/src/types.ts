export interface Window {
  start: string;
  end?: string;
}

export interface Normalized {
  occurrences: Window[] | null;
  rrules: string[] | null;
  abstained: boolean;
  limitation?: string;
}

export interface Adapter {
  parse(text: string): unknown | Promise<unknown>;
  parseMany?(texts: string[]): Promise<unknown[]>;
  normalize(value: any): Normalized;
  dispose?(): void;
}

// The same reference every gold resolution uses (a Thursday, 09:00 in Hanoi).
export const reference = "2026-09-17T09:00:00+07:00";
export const timeZone = "Asia/Ho_Chi_Minh";
export const limit = 12;
