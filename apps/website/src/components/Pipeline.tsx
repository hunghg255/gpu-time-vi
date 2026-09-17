import { useEffect, useRef, useState } from "react";
import { demoDefault } from "../lib/demo";

// The same phrase the demo is parsing, taken apart stage by stage: the
// tokenizer's features, the roles the model assigned, the schedule the
// compiler built, and the dates the resolver returned. Everything shown here
// is read from a real run of the packaged parser.

type ScheduleParser = Awaited<
  ReturnType<typeof import("gpu-time-vi/schedule").defineParser>
>;
type Parsed = Awaited<ReturnType<ScheduleParser["parse"]>>;
type Token = NonNullable<Parsed["tokens"]>[number];

const ROLE_VI: Record<string, string> = {
  O: "ngoài biểu thức",
  NUM: "số lượng",
  ORD: "thứ tự",
  UNIT: "đơn vị",
  DIR_BEFORE: "lùi về trước",
  DIR_AFTER: "tiến về sau",
  NOW: "bây giờ",
  REL_DAY: "ngày tương đối",
  DEICTIC: "này / sau / trước",
  WEEKDAY: "thứ trong tuần",
  DAYGROUP: "nhóm ngày",
  MONTH: "tháng",
  DOM: "ngày trong tháng",
  YEAR: "năm",
  HOUR: "giờ",
  MINUTE: "phút",
  SECOND: "giây",
  MERIDIEM: "buổi (đi với giờ)",
  TIME_NAMED: "giờ có tên",
  DAYPART: "buổi",
  RANGE_START: "mở khoảng",
  RANGE_END: "đóng khoảng",
  RECUR: "lặp lại",
  FREQ: "tần suất",
  TIMES: "số lần",
  BOUND_START: "bắt đầu chuỗi",
  BOUND_END: "kết thúc chuỗi",
  COUNT: "số lần xuất hiện",
  DUR: "thời lượng",
  EXCEPT: "loại trừ",
  HOLIDAY: "ngày lễ",
  JOIN: "nối mệnh đề",
  GLUE: "từ chức năng",
  EDGE: "đầu / giữa / cuối",
  CLOCK_OFFSET: "rưỡi / kém / hơn",
  LUNAR: "âm lịch",
};

const ROLE_KIND: Record<string, "date" | "time" | "repeat" | "duration"> = {
  NOW: "date",
  REL_DAY: "date",
  DEICTIC: "date",
  WEEKDAY: "date",
  DAYGROUP: "date",
  MONTH: "date",
  DOM: "date",
  YEAR: "date",
  HOLIDAY: "date",
  EDGE: "date",
  LUNAR: "date",
  ORD: "date",
  HOUR: "time",
  MINUTE: "time",
  SECOND: "time",
  MERIDIEM: "time",
  TIME_NAMED: "time",
  DAYPART: "time",
  CLOCK_OFFSET: "time",
  RANGE_START: "time",
  RANGE_END: "time",
  RECUR: "repeat",
  FREQ: "repeat",
  TIMES: "repeat",
  BOUND_START: "repeat",
  BOUND_END: "repeat",
  COUNT: "repeat",
  EXCEPT: "repeat",
  NUM: "duration",
  UNIT: "duration",
  DIR_BEFORE: "duration",
  DIR_AFTER: "duration",
  DUR: "duration",
};

const KIND_CLASS = {
  date: "bg-date",
  time: "bg-time",
  repeat: "bg-repeat",
  duration: "bg-duration",
};

const KINDS = ["chữ", "số", "dấu", "khoảng trắng"];
const CLASSES = [
  ..."abcdefghijklmnopqrstuvwxyz",
  ..."ăâđêôơư",
  ..."0123456789",
];

function characterClass(value: number): string {
  return value < CLASSES.length ? CLASSES[value] : "dấu";
}

// Decode the sparse feature row the tokenizer packed into two 32-bit words.
function features(token: Token) {
  const [identity, context] = token.features;
  return {
    kind: KINDS[identity & 3],
    length: (identity >>> 2) & 7,
    first: characterClass((identity >>> 5) & 63),
    last: characterClass((identity >>> 11) & 63),
    hash: (identity >>> 17) & 255,
    skeleton: context & 127,
    number: (identity >>> 25) & 15,
  };
}

function Stage({
  step,
  title,
  note,
  children,
}: {
  step: number;
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <li className="relative pl-9">
      <span
        className="absolute left-0 top-0 flex size-6 items-center justify-center rounded-full bg-black text-[11px] font-semibold text-white"
        aria-hidden="true"
      >
        {step}
      </span>
      <h3 className="text-body font-medium">{title}</h3>
      <p className="mt-0.5 text-note leading-normal text-neutral-500">{note}</p>
      <div className="mt-2.5">{children}</div>
    </li>
  );
}

export function Pipeline() {
  const [text, setText] = useState(demoDefault);
  const [parsed, setParsed] = useState<Parsed | undefined>(undefined);
  const [resolved, setResolved] = useState<
    | {
        occurrences: { start: string; end?: string; allDay: boolean }[];
        rrules: string[];
      }
    | undefined
  >(undefined);
  const parser = useRef<ScheduleParser>(undefined);
  const seq = useRef(0);

  useEffect(() => {
    function follow(event: Event) {
      setText((event as CustomEvent<string>).detail);
    }
    window.addEventListener("demo:text", follow);
    return () => window.removeEventListener("demo:text", follow);
  }, []);

  useEffect(() => {
    if (!text.trim()) return;
    const ticket = ++seq.current;
    const timer = setTimeout(async () => {
      try {
        if (!parser.current) {
          const { defineParser } = await import("gpu-time-vi/schedule");
          parser.current = await defineParser({ backend: "cpu", tokens: true });
        }
        const result = await parser.current.parse(text.trim());
        const { resolve } = await import("gpu-time-vi/schedule");
        const dates = {
          occurrences: [] as { start: string; end?: string; allDay: boolean }[],
          rrules: [] as string[],
        };
        for (const expression of result.expressions) {
          if (!expression.schedule) continue;
          try {
            const value = resolve(expression.schedule, {
              reference: new Date().toISOString(),
              timeZone: "Asia/Ho_Chi_Minh",
              limit: 3,
            });
            dates.occurrences.push(
              ...value.occurrences.map(({ start, end, allDay }) => ({
                start,
                ...(end ? { end } : {}),
                allDay,
              })),
            );
            dates.rrules.push(...value.rrules);
          } catch {
            // The stage shows the compiler's diagnostics instead.
          }
        }
        if (ticket !== seq.current) return;
        setParsed(result);
        setResolved(dates);
      } catch {
        if (ticket === seq.current) setParsed(undefined);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [text]);

  const tokens = (parsed?.tokens ?? []).filter((token) => token.kind !== 3);
  const rolesUsed = [...new Set(tokens.map((token) => token.label))].filter(
    (label) => label !== "O",
  );

  return (
    <div className="rounded-box border border-neutral-100 bg-neutral-50 p-4 sm:p-5">
      <p className="mb-4 text-note leading-normal text-neutral-500">
        Câu đang phân tích:{" "}
        <span className="font-medium text-neutral-900">“{text}”</span>
        {parsed && (
          <span className="ml-2 tabular-nums text-neutral-400">
            · tách {parsed.timings.tokenizeMs.toFixed(1)} ms · mô hình{" "}
            {parsed.timings.inferMs.toFixed(1)} ms · lắp lịch{" "}
            {parsed.timings.compileMs.toFixed(1)} ms
          </span>
        )}
      </p>
      <ol className="space-y-6">
        <Stage
          step={1}
          title="Tách token và tính đặc trưng"
          note="Mỗi tiếng, số hay dấu là một token. Mô hình không có từ điển: nó chỉ thấy vài con số về hình dạng của token — kiểu, độ dài, chữ đầu và chữ cuối (đã bỏ dấu thanh), một hash 8 bit của chữ thường và một hash của khung phụ âm. Dấu thanh chỉ còn lại trong hash, nên “sáu” và “sau” khác nhau ở đó."
        >
          <ul className="flex flex-wrap gap-1.5">
            {tokens.map((token, index) => {
              const shape = features(token);
              return (
                <li
                  key={index}
                  className="rounded-md border border-neutral-200 bg-white px-2 py-1 font-mono text-[13px] leading-tight"
                  title={`kiểu ${shape.kind} · độ dài bucket ${shape.length} · đầu “${shape.first}” · cuối “${shape.last}” · hash ${shape.hash} · khung phụ âm ${shape.skeleton}`}
                >
                  <span className="block font-sans text-sm text-neutral-900">
                    {token.text}
                  </span>
                  <span className="mt-0.5 block text-neutral-400">
                    {shape.kind} · {shape.first}…{shape.last} · #{shape.hash}
                  </span>
                </li>
              );
            })}
          </ul>
        </Stage>

        <Stage
          step={2}
          title="Mô hình gán vai trò cho từng token"
          note="Một mạng nhỏ 38 745 tham số quét câu theo cả hai chiều, nên mỗi token “nhìn thấy” ngữ cảnh quanh nó, rồi chọn một trong 36 vai trò. Con số dưới mỗi token là độ tin cậy. Một điểm ranh giới riêng cắt câu thành các mệnh đề độc lập (‖). Trên WebGPU, các khối token chạy song song và chuyển tiếp ngữ cảnh cho nhau."
        >
          <ul className="flex flex-wrap items-end gap-1.5">
            {tokens.map((token, index) => {
              const kind = ROLE_KIND[token.label];
              return (
                <li key={index} className="flex items-end gap-1.5">
                  {token.clauseStart && index > 0 && (
                    <span
                      className="pb-2 text-neutral-300"
                      aria-label="ranh giới mệnh đề"
                    >
                      ‖
                    </span>
                  )}
                  <span
                    className={`rounded-md px-2 py-1 text-center ${kind ? KIND_CLASS[kind] : "bg-white ring-1 ring-neutral-200"}`}
                  >
                    <span className="block text-sm text-neutral-900">
                      {token.text}
                    </span>
                    <span className="block font-mono text-[11px] leading-tight text-neutral-600">
                      {token.label}
                    </span>
                    <span className="block h-1 w-full overflow-hidden rounded bg-black/10">
                      <span
                        className="block h-full bg-black/50"
                        style={{ width: `${Math.round(token.score * 100)}%` }}
                      />
                    </span>
                    <span className="block font-mono text-[11px] text-neutral-500">
                      {Math.round(token.score * 100)}%
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
          {rolesUsed.length > 0 && (
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[13px] text-neutral-500 sm:grid-cols-3">
              {rolesUsed.map((label) => (
                <div key={label} className="flex gap-1.5">
                  <dt className="font-mono text-neutral-700">{label}</dt>
                  <dd>{ROLE_VI[label] ?? label}</dd>
                </div>
              ))}
            </dl>
          )}
        </Stage>

        <Stage
          step={3}
          title="Lắp vai trò thành lịch"
          note="Từ đây không còn học máy nữa. TypeScript đọc dãy vai trò thành một cấu trúc có kiểu: ngày, giờ, khoảng, dịch chuyển, quy tắc lặp. Các con số được kiểm tra (giờ ≤ 24, ngày trong tháng hợp lệ…) và lỗi trở thành chẩn đoán thay vì ngày sai."
        >
          {parsed?.expressions.length ? (
            parsed.expressions.map((expression, index) => (
              <div key={index} className="mb-2 last:mb-0">
                <pre className="overflow-x-auto rounded-md bg-neutral-900 p-3 font-mono text-[12.5px] leading-[1.6] text-neutral-200">
                  {JSON.stringify(expression.schedule, null, 2)}
                </pre>
                {expression.diagnostics.map((diagnostic, position) => (
                  <p key={position} className="mt-1 text-[13px] text-amber-700">
                    {diagnostic.code}: {diagnostic.message}
                  </p>
                ))}
              </div>
            ))
          ) : (
            <p className="text-note text-neutral-500">
              Không có biểu thức thời gian nào trong câu này.
            </p>
          )}
        </Stage>

        <Stage
          step={4}
          title="Giải ra ngày giờ thật"
          note="Chỉ ở bước cuối mới cần biết “bây giờ” là lúc nào và múi giờ nào. Ngày tương đối, thứ, DST, âm lịch (tính theo lịch Việt Nam, UTC+7) và giới hạn số lần đều được giải bằng số học lịch chính xác, không phải bằng mô hình."
        >
          {resolved?.occurrences.length ? (
            <ul className="space-y-1 font-mono text-[13px]">
              {resolved.occurrences.map((occurrence, index) => (
                <li key={index} className="text-neutral-800">
                  {occurrence.start}
                  {occurrence.end ? ` → ${occurrence.end}` : ""}
                  {occurrence.allDay ? "  (cả ngày)" : ""}
                </li>
              ))}
              {resolved.rrules.map((rule, index) => (
                <li
                  key={`rule-${index}`}
                  className="whitespace-pre-wrap text-violet-800"
                >
                  {rule}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-note text-neutral-500">
              Chưa có ngày giờ nào để giải.
            </p>
          )}
        </Stage>
      </ol>
    </div>
  );
}
