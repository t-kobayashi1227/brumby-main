// 戦略を作ったときに、AIへ実際に送った内容（指示文と、渡した入力）を読み直す。サマリーの最下部の「AIに送った内容」で見せる
// 入力は agent_calls.input（送った会話そのまま）から出す。指示文は DB に中身を残していないので、今の prompts/ から組み立て、
// 送ったときのハッシュ（agent_calls.prompt_sha256）と一致したときだけ「送った指示文」として出す。一致しないとき（あとで指示文を直した）は出さない
// このほか、答えの形（JSON の形）の指定も送っているが、DB に残していないので出さない（画面にそう書く）
// APIキーなどの秘密は、指示文にも入力にも入っていない

import type { Sql } from "../db";
import type { ChatMessage } from "./llm";
import { agentPrompt, PROMPT_FILES } from "./prompts";
import type { AgentName } from "./schemas";

export interface PromptLogEntry {
  agent: string;
  model: string;
  effort: string | null;
  promptFile: string;
  /** 送った指示文。今の指示文と送ったときの指示文が違うときは null */
  system: string | null;
  /** 送った会話（ふつうは user の1通。中身は JSON の文字列） */
  messages: ChatMessage[];
  status: string;
}

const isAgent = (a: string): a is AgentName => a in PROMPT_FILES;

interface CallRow {
  agent: string;
  model: string;
  effort: string | null;
  prompt_file: string;
  prompt_sha256: string;
  input: unknown;
  status: string;
}

/** DB の1行を画面に出す形にする（DB を読まない部分。テストする） */
export function toPromptLogEntry(row: CallRow, current: (agent: AgentName) => { sha256: string; system: string } = agentPrompt): PromptLogEntry {
  let now: { sha256: string; system: string } | null = null;
  try {
    now = isAgent(row.agent) ? current(row.agent) : null;
  } catch {
    // 指示文のファイルが読めないときは、指示文を出さない（入力は出す）
  }
  const input = row.input as { messages?: unknown } | null;
  const messages = Array.isArray(input?.messages)
    ? input.messages.filter((m): m is ChatMessage => !!m && typeof m === "object" && typeof (m as ChatMessage).content === "string")
    : [];
  return {
    agent: row.agent,
    model: row.model,
    effort: row.effort,
    promptFile: row.prompt_file,
    system: now && now.sha256 === row.prompt_sha256 ? now.system : null,
    messages,
    status: row.status,
  };
}

/** 実行1回分の呼び出しを、呼んだ順に読む。run が物件のものでなければ null */
export async function loadPromptLog(sql: Sql, propertyId: number, runId: number): Promise<PromptLogEntry[] | null> {
  const [run] = await sql`select 1 from strategy_runs where id = ${runId} and property_id = ${propertyId}`;
  if (!run) return null;
  const rows = await sql<CallRow[]>`
    select agent, model, effort, prompt_file, prompt_sha256, input, status
    from agent_calls where run_id = ${runId} order by id
  `;
  return rows.map((r) => toPromptLogEntry(r));
}
