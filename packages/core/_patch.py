def edit(path, pairs):
    s = open(path, encoding="utf-8").read()
    for a, b in pairs:
        assert a in s, (path, a[:70])
        s = s.replace(a, b, 1)
    open(path, "w", encoding="utf-8", newline="\n").write(s)


edit(
    "src/lexicon.ts",
    [
        (
            '''export function holiday(text: string): HolidayName | undefined {
  const word = key(text).replace(/^(ngày|lễ|dịp|kỳ nghỉ|nghỉ)\\s+/, "");
  return holidayNames[word];
}''',
            '''export function holiday(text: string): HolidayName | undefined {
  // "Tết này", "Giáng sinh năm nay", "Trung thu tới": the modifier adds nothing
  // to a holiday, which is always its next occurrence.
  const word = key(text)
    .replace(/^(ngày|lễ|dịp|kỳ nghỉ|nghỉ)\\s+/, "")
    .replace(/\\s+(này|nay|năm nay|năm này|tới|sắp tới|sau|năm sau|năm tới)$/, "");
  return holidayNames[word];
}''',
        ),
        (
            '''export const modifiers: Record<string, Modifier> = {
  này: "this",
  nay: "this",
  sau: "next",''',
            '''export const modifiers: Record<string, Modifier> = {
  này: "this",
  nay: "this",
  sau: "next",
  sang: "next",''',
        ),
    ],
)

edit(
    "src/compile.ts",
    [
        # DEICTIC before a unit: "sang tuần", "sang năm".
        (
            '''      case Role.DEICTIC:
        fail(token, "invalid-modifier", `${next.text} needs a period before it.`);''',
            '''      case Role.DEICTIC:
        if (reader.role(1) === Role.UNIT) {
          // "sang tuần", "sang năm": the modifier leads the unit.
          const modifier = readModifier(reader.take());
          const unitSegment = reader.take();
          setDate({
            token,
            unit: readUnit(unitSegment),
            modifier,
          });
          break;
        }
        fail(token, "invalid-modifier", `${next.text} needs a period before it.`);''',
        ),
        # Unknown holiday phrase: skip it with a warning instead of failing.
        (
            '''      default:
        if (dateRoles.has(next.role)) setDate(readDate(reader));
        else fail(token, "unsupported", `Unsupported role at ${next.text}.`);''',
            '''      default:
        if (next.role === Role.HOLIDAY && !holidayName(next.text)) {
          // A capitalised name the model took for a holiday ("trận Việt Nam").
          reader.take();
          diagnostics.push(
            diagnostic(
              token,
              "unknown-holiday",
              `Ignored ${next.text}: not a known holiday.`,
              "warning",
            ),
          );
          break;
        }
        if (dateRoles.has(next.role)) setDate(readDate(reader));
        else fail(token, "unsupported", `Unsupported role at ${next.text}.`);''',
        ),
        # A holiday keeps its date when "năm nay" follows it.
        (
            '''    } else if (
      date &&
      date.day !== undefined &&
      state.day !== undefined &&
      state.month === undefined &&
      !state.lunar
    ) {''',
            '''    } else if (
      date?.holiday &&
      state.unit === "year" &&
      state.modifier &&
      state.day === undefined
    ) {
      // "Trung thu năm nay": the holiday already names the year.
    } else if (
      date &&
      date.day !== undefined &&
      state.day !== undefined &&
      state.month === undefined &&
      !state.lunar
    ) {''',
        ),
        # "30p", "2h" whose letter the model left as glue.
        (
            '''      case Role.NUM: {
        if (reader.role(1) === Role.UNIT) {''',
            '''      case Role.NUM: {
        // "30p", "2h": a clock letter the model left as glue is the unit.
        const glued = reader.segments[reader.segments.indexOf(next) + 1];
        if (
          glued?.role === Role.GLUE &&
          reader.role(1) !== Role.UNIT &&
          ["h", "p", "ph", "g"].includes(glued.text) &&
          unitName(glued.text)
        )
          glued.role = Role.UNIT;
        if (reader.role(1) === Role.UNIT) {''',
        ),
        # Range whose end names only a smaller day: it is in the next month.
        (
            '''      // "từ 10 đến 15 tháng 3": the start shares the end's month and year.
      if (from.month === undefined && to.month !== undefined)
        from.month = to.month;''',
            '''      // "từ 10 đến 15 tháng 3": the start shares the end's month and year.
      if (from.month === undefined && to.month !== undefined)
        from.month = to.month;
      // "từ 27 tháng chạp đến mùng 6": a smaller end day is next month's.
      if (
        to.month === undefined &&
        from.month !== undefined &&
        to.day !== undefined &&
        from.day !== undefined &&
        to.day < from.day
      )
        to.month = (from.month % 12) + 1;''',
        ),
    ],
)
print("patched")
