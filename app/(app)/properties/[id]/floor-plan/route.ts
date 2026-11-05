// 物件に添付した間取り図の画像を返す（入力画面で見せるため）。アクセス制限は Basic認証（proxy.ts）
// 物件の情報は秘密保持の対象なので、ブラウザや途中にためさせない
import { getSql } from "../../../../../lib/db";
import { detectImageType } from "../../../../../lib/floor-plan";
import { parsePropertyId } from "../../../../../lib/property";

export async function GET(_req: Request, ctx: RouteContext<"/properties/[id]/floor-plan">) {
  const { id } = await ctx.params;
  const propertyId = parsePropertyId(id);
  if (propertyId === null) return new Response("Not Found", { status: 404 });
  const [row] = await getSql()<{ floor_plan_image: Uint8Array | null }[]>`select floor_plan_image from properties where id = ${propertyId}`;
  const bytes = row?.floor_plan_image ?? null;
  const type = bytes ? detectImageType(bytes) : null;
  if (!bytes || !type) return new Response("Not Found", { status: 404 });
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
