// 物件に添付した画像（外観・内観・間取り図）を返す（入力画面で見せるため）。アクセス制限は Basic認証（proxy.ts）
// 物件の情報は秘密保持の対象なので、ブラウザや途中にためさせない
import { getSql } from "../../../../../../lib/db";
import { detectImageType, kindBySlug } from "../../../../../../lib/property-images";
import { parsePropertyId } from "../../../../../../lib/property";

export async function GET(_req: Request, ctx: RouteContext<"/properties/[id]/images/[kind]">) {
  const { id, kind } = await ctx.params;
  const propertyId = parsePropertyId(id);
  const k = kindBySlug(kind);
  if (propertyId === null || !k) return new Response("Not Found", { status: 404 });
  const [row] = await getSql()<{ image: Uint8Array }[]>`select image from property_images where property_id = ${propertyId} and kind = ${k.kind}`;
  const type = row ? detectImageType(row.image) : null;
  if (!row || !type) return new Response("Not Found", { status: 404 });
  return new Response(new Uint8Array(row.image), { headers: { "Content-Type": type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
