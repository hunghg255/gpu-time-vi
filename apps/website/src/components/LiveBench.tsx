import { useState } from "react";

// Parse the same 1,000 phrases on each backend and time the public
// parseMany call, the way packages/benchmark/src/worker.ts does.
const workload = [
  "trưa mai",
  "thứ hai tuần sau lúc 2 giờ chiều",
  "mỗi thứ sáu",
  "họp nhóm 3 giờ chiều thứ hai tuần sau",
  "từ 9h đến 17h",
  "mùng 1 Tết",
  "cách đây 3 ngày",
  "thứ bảy chủ nhật từ 1 giờ đến 8 giờ tối và thứ hai từ 10 giờ tối đến 12 giờ đêm",
];
const COUNT = 1000;
const texts = Array.from(
  { length: COUNT },
  (_, index) => workload[index % workload.length],
);
const context = { reference: new Date().toISOString(), limit: 3 };

interface Row {
  backend: "cpu" | "webgpu";
  initializationMs?: number;
  warmMs?: number;
  batchMs?: number;
  error?: string;
}

async function measure(backend: "cpu" | "webgpu"): Promise<Row> {
  const { defineParser } = await import("gpu-time-vi");
  const started = performance.now();
  let parser: Awaited<ReturnType<typeof defineParser>>;
  try {
    parser = await defineParser({ backend });
  } catch (error) {
    return { backend, error: String(error) };
  }
  const initializationMs = performance.now() - started;
  try {
    const warm = performance.now();
    await parser.parseMany(texts.slice(0, 64), context);
    const warmMs = performance.now() - warm;
    const samples: number[] = [];
    for (let trial = 0; trial < 3; trial++) {
      const begin = performance.now();
      await parser.parseMany(texts, context);
      samples.push(performance.now() - begin);
    }
    samples.sort((a, b) => a - b);
    return { backend, initializationMs, warmMs, batchMs: samples[1] };
  } catch (error) {
    return { backend, initializationMs, error: String(error) };
  } finally {
    parser.dispose();
  }
}

export function LiveBench() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setRows([]);
    const results: Row[] = [];
    for (const backend of ["cpu", "webgpu"] as const) {
      results.push(await measure(backend));
      setRows([...results]);
    }
    setBusy(false);
  }

  const cpu = rows.find((row) => row.backend === "cpu")?.batchMs;
  const gpu = rows.find((row) => row.backend === "webgpu")?.batchMs;

  return (
    <div className="mt-2 rounded-box border border-neutral-100 bg-neutral-50 p-4">
      <button
        type="button"
        disabled={busy}
        onClick={() => void run()}
        className="inline-flex items-center justify-center rounded-full bg-black px-3.5 py-2.5 text-sm font-medium leading-none tracking-[-0.14px] text-white transition-colors hover:bg-neutral-700 disabled:opacity-50"
      >
        {busy ? "Đang đo…" : `Phân tích ${COUNT.toLocaleString("vi-VN")} câu`}
      </button>
      {rows.length > 0 && (
        <table className="mt-3 w-full text-body tabular-nums">
          <thead className="text-label uppercase text-neutral-500">
            <tr>
              <th className="py-1 text-left font-medium">Backend</th>
              <th className="py-1 text-right font-medium">Khởi tạo</th>
              <th className="py-1 text-right font-medium">
                {COUNT.toLocaleString("vi-VN")} câu
              </th>
              <th className="py-1 text-right font-medium">câu/giây</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.backend} className="border-t border-neutral-200">
                <td className="py-1">
                  {row.backend === "cpu" ? "CPU" : "WebGPU"}
                </td>
                {row.error ? (
                  <td className="py-1 text-right text-neutral-500" colSpan={3}>
                    {row.backend === "webgpu"
                      ? "Trình duyệt này không có WebGPU"
                      : row.error}
                  </td>
                ) : (
                  <>
                    <td className="py-1 text-right">
                      {row.initializationMs?.toFixed(0)} ms
                    </td>
                    <td className="py-1 text-right font-medium">
                      {row.batchMs?.toFixed(0)} ms
                    </td>
                    <td className="py-1 text-right">
                      {row.batchMs
                        ? Math.round(
                            (COUNT / row.batchMs) * 1000,
                          ).toLocaleString("vi-VN")
                        : ""}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {cpu && gpu && (
        <p className="mt-2 text-note text-neutral-500">
          Trên máy này WebGPU nhanh gấp {(cpu / gpu).toFixed(1)} lần CPU cho
          batch {COUNT.toLocaleString("vi-VN")} câu.
        </p>
      )}
    </div>
  );
}
