// The workspace build's schedule entry, aliased in astro.config.mjs. Only the
// shape the pipeline section reads is declared here.
declare module "gpu-time-vi/schedule" {
  export interface PipelineToken {
    text: string;
    start: number;
    end: number;
    kind: 0 | 1 | 2 | 3;
    features: [number, number];
    label: string;
    clauseStart: boolean;
    score: number;
  }
  export interface PipelineDiagnostic {
    code: string;
    message: string;
    severity: "error" | "warning";
  }
  export interface PipelineExpression {
    start: number;
    end: number;
    text: string;
    confidence: number;
    schedule: unknown | null;
    diagnostics: PipelineDiagnostic[];
  }
  export interface PipelineResult {
    expressions: PipelineExpression[];
    backend: "cpu" | "webgpu";
    timings: { tokenizeMs: number; inferMs: number; compileMs: number };
    tokens?: PipelineToken[];
  }
  export function defineParser(options?: {
    backend?: "auto" | "cpu" | "webgpu";
    tokens?: boolean;
  }): Promise<{
    parse(text: string): Promise<PipelineResult>;
    dispose(): void;
  }>;
  export function resolve(
    schedule: unknown,
    options: { reference: string; timeZone: string; limit?: number },
  ): {
    occurrences: { start: string; end?: string; allDay: boolean }[];
    rrules: string[];
  };
}
