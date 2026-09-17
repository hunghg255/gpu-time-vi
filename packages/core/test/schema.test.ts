import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { expect, it } from "vitest";
import { readGold } from "./gold.ts";

const schemaPath = `${import.meta.dirname}/../schema/schedule.schema.json`;

it("validates schedule structure and rejects empty clauses or invalid clock components", () => {
  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
  const validate = new Ajv2020({ strict: true }).compile(schema);

  expect(
    validate({
      clauses: [
        {
          date: { kind: "weekday", days: ["SA", "SU"] },
          time: {
            start: { hour: 13, minute: 0 },
            end: { hour: 20, minute: 0 },
          },
        },
      ],
    }),
  ).toBe(true);
  expect(validate({ clauses: [] })).toBe(false);
  expect(validate({ clauses: [{}] })).toBe(false);
  expect(
    validate({ clauses: [{ date: { kind: "now" }, timeZone: "UTC" }] }),
  ).toBe(false);
  expect(
    validate({ clauses: [{ time: { start: { hour: 26, minute: 0 } } }] }),
  ).toBe(false);
  expect(
    validate({ clauses: [{ recurrence: { freq: "weekly", interval: 0 } }] }),
  ).toBe(false);
  expect(
    validate({
      clauses: [
        { recurrence: { freq: "monthly", interval: 1, byMonthDay: [0] } },
      ],
    }),
  ).toBe(false);
  expect(
    validate({ clauses: [{ date: { kind: "weekday", days: ["XX"] } }] }),
  ).toBe(false);
});

it("accepts every hand-authored gold schedule", () => {
  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  const validate = new Ajv2020({ strict: true }).compile(schema);
  for (const file of [
    "grammar",
    "adversarial",
    "labels",
    "prose",
    "negatives",
  ]) {
    for (const record of readGold<{ id: string; schedule: unknown }>(file)) {
      if (record.schedule === null) continue;
      expect(
        validate(record.schedule),
        `${record.id}: ${JSON.stringify(validate.errors)}`,
      ).toBe(true);
    }
  }
});
