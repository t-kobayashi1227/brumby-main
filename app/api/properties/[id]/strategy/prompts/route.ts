import { loadPromptLog } from "../../../../../../lib/agents/prompt-log";
import { getSql } from "../../../../../../lib/db";
import { parsePropertyId } from "../../../../../../lib/property";

// 戦略を作ったときにAIへ送った内容（指示文と入力）。サマリーの「AIに送った内容」を開いたときだけ読む（事実シートが大きいため、ページには載せない）
// GET /api/properties/[id]/strategy/prompts?run=<実行の番号>

export async function GET(req: Request, ctx: RouteContext<"/api/properties/[id]/strategy/prompts">) {
  const propertyId = parsePropertyId((await ctx.params).id);
  const runId = parsePropertyId(new URL(req.url).searchParams.get("run") ?? "");
  if (propertyId === null || runId === null) return Response.json({ error: "番号が正しくありません" }, { status: 400 });
  const calls = await loadPromptLog(getSql(), propertyId, runId);
  if (calls === null) return Response.json({ error: "この物件の実行が見つかりません" }, { status: 404 });
  return Response.json({ calls });
}
