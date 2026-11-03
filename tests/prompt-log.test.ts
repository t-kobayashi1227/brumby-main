import { describe, expect, it } from "vitest";
import { toPromptLogEntry } from "../lib/agents/prompt-log";

const current = () => ({ sha256: "abc", system: "今の指示文" });
const row = (over: Partial<Parameters<typeof toPromptLogEntry>[0]> = {}) => ({
  agent: "戦略",
  model: "claude-sonnet-5-5",
  effort: "medium",
  prompt_file: "strategy.txt",
  prompt_sha256: "abc",
  input: { messages: [{ role: "user", content: '{"事実シート":{}}' }] },
  status: "succeeded",
  ...over,
});

describe("AIに送った内容", () => {
  it("送ったときと今の指示文が同じなら、指示文と入力を出す", () => {
    const e = toPromptLogEntry(row(), current);
    expect(e.system).toBe("今の指示文");
    expect(e.messages).toEqual([{ role: "user", content: '{"事実シート":{}}' }]);
    expect(e.promptFile).toBe("strategy.txt");
  });

  it("指示文をあとで直したとき（ハッシュが違う）は、指示文を出さない", () => {
    expect(toPromptLogEntry(row({ prompt_sha256: "old" }), current).system).toBeNull();
  });

  it("知らない担当（以前の7回の形）は指示文を出さず、入力の形が違っても落ちない", () => {
    const e = toPromptLogEntry(row({ agent: "立地", input: { foo: 1 } }), current);
    expect(e.system).toBeNull();
    expect(e.messages).toEqual([]);
  });
});

describe("AIに送った内容（指示文が読めないとき）", () => {
  it("指示文のファイルが読めなくても落ちず、指示文だけ出さない", () => {
    const e = toPromptLogEntry(row(), () => {
      throw new Error("ENOENT");
    });
    expect(e.system).toBeNull();
    expect(e.messages).toHaveLength(1);
  });
});
