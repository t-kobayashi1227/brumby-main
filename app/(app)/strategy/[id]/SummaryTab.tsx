"use client";

import type { StrategyResult } from "../../../../lib/agents/run";
import { salesFocusOf } from "../../../../lib/agents/sales-focus";
import type { SalesFocus } from "../../../../lib/agents/schemas";
import type { AreaMapData } from "../../../../lib/area-map";
import type { AreaPriceResult } from "../../../../lib/area-price";
import type { Fact } from "../../../../lib/facts/types";
import { concernTopic, factsToCheck, featureText, nextCheck, shortLabel, summaryFeatures, TARGET_IMAGES, targetDefinition, targetPoints, usedFactIds } from "../../../../lib/report";
import { AlertIcon, ClipboardIcon, HomeIcon, MegaphoneIcon, SearchIcon, SparkIcon, UsersIcon } from "../../../_components/icons";
import { Ai, Card, Evidence, factIcon, HypothesisBadge, Num, useReportNav } from "./parts";
import AreaMap from "./AreaMap";
import AreaPrice from "./AreaPrice";
import PromptLog from "./PromptLog";

// ① サマリー：（2026-11-05〜）この物件でいちばん大事なこと → 販売の基本戦略（メインの買い手・物件のポイント・訴求のポイント・推奨方針。2026-11-04 浩平さん依頼で推奨方針の枠を組み直し）→ 地図と区の価格相場（2カラム、2026-11-03 追加）→ 懸念点 → 次に確かめること → AIに送った内容（最初は閉じておく）
// 懸念点の対策案（concerns[].action）は出さない（10/26 決定を 2026-11-03 に浩平さんが再確認）。AIの答えとDBには残る
// 「データの注意点」（2026-11-04 に「次に確かめること」から改名。利用者が作業を求められていると受け取らないように）は、取得できず・要確認の事実から決まった文で作る（AIは使わない。lib/report.ts の nextCheck）

const MAX_CONCERNS = 3;

export default function SummaryTab({
  r,
  facts,
  factList,
  propertyId,
  runId,
  areaMap,
  areaPrice,
}: {
  r: StrategyResult;
  facts: Map<string, Fact>;
  factList: Fact[];
  propertyId: number;
  runId: number;
  areaMap: AreaMapData | null;
  areaPrice: AreaPriceResult;
}) {
  const { openFact } = useReportNav();
  const m = r.戦略;
  const topConcerns = m.concerns.slice(0, MAX_CONCERNS);
  const restConcerns = m.concerns.slice(MAX_CONCERNS);
  // 取れなかった事実を全部は出さない。災害・学区と、根拠に使った要確認の事実だけ（lib/report.ts の factsToCheck）
  const missingFacts = factsToCheck(factList, usedFactIds(r.戦略, r.媒体));
  // 上の件数は、下の「データの注意点」の項目数（事実とAIの「分からないこと」）とそろえる
  const notes = missingFacts.length + m.unknown.length;

  return (
    <div className="grid gap-4">
      <BasicStrategy r={r} facts={facts} factList={factList} notes={notes} />

      {/* 地図（左）と区の価格相場（右）。狭い画面では縦に並べる。地図が無いときは相場だけを横幅いっぱいに */}
      <div className={`grid gap-4 ${areaMap ? "lg:grid-cols-2" : ""}`}>
        {areaMap && <AreaMap data={areaMap} compact />}
        <AreaPrice result={areaPrice} />
      </div>

      <Card title="買い手が気にしそうな点" icon={AlertIcon}>
        {topConcerns.length === 0 ? (
          <div className="text-[13px] text-sub">特にありません。</div>
        ) : (
          <ol className="grid gap-3 md:grid-cols-3">
            {topConcerns.map((c, i) => (
              <li key={i} className="flex gap-2.5 rounded-lg border border-line bg-[#fffaf5] p-3">
                <Num n={i + 1} />
                <div className="min-w-0">
                  <TopicTag topic={concernTopic(c.evidence, facts)} />
                  <Ai>{c.text}</Ai>
                  <Evidence ids={c.evidence} facts={facts} max={2} />
                </div>
              </li>
            ))}
          </ol>
        )}
        {restConcerns.length > 0 && (
          <details className="mt-3 text-[13px]">
            <summary className="cursor-pointer text-primary">ほか {restConcerns.length}件</summary>
            <ul className="mt-2 grid gap-2">
              {restConcerns.map((c, i) => (
                <li key={i}>
                  <TopicTag topic={concernTopic(c.evidence, facts)} />
                  <Ai size="sm">{c.text}</Ai>
                  <Evidence ids={c.evidence} facts={facts} max={2} />
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>

      <Card title="データの注意点" icon={ClipboardIcon}>
        {missingFacts.length === 0 && m.unknown.length === 0 ? (
          <div className="text-[13px] text-sub">注意点はありません。</div>
        ) : (
          <div className={`grid gap-4 ${missingFacts.length > 0 && m.unknown.length > 0 ? "lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]" : ""}`}>
            {missingFacts.length > 0 && (
            <div className="min-w-0">
              <div className="mb-2 text-[12px] text-sub">災害・学区で取れなかったデータと、戦略の根拠にした値で確かめが要るものです。確かめ方を添えています。ほかに取れなかったデータは、根拠データタブで見られます。</div>
              <ul className="grid gap-2">
                {missingFacts.map((f) => {
                  const n = nextCheck(f);
                  return (
                    <li key={f.id} className="flex items-start gap-2.5 rounded-lg border border-line p-2.5">
                      <AlertIcon className="mt-0.5 size-4 shrink-0 text-accent" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-bold text-ink">{n.what}</div>
                        <div className="text-[12px] text-sub">
                          確認先：{n.who}・
                          <button type="button" onClick={() => openFact(f.id)} className="text-primary underline underline-offset-2 cursor-pointer">
                            {shortLabel(f.項目)}（{f.状態}）
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
            )}
            {m.unknown.length > 0 && (
              <div className="min-w-0">
                <div className="mb-2 text-[12px] text-sub">AIが「事実シートから分からない」と挙げたこと</div>
                <ul className="grid gap-1.5">
                  {m.unknown.map((u, i) => (
                    <li key={i}>
                      <Ai size="sm">{u}</Ai>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Card>

      <PromptLog propertyId={propertyId} runId={runId} />
    </div>
  );
}

const RANK_NAME = ["メイン", "第二", "第三", "第四", "第五"];

/**
 * 販売の基本戦略（2026-11-04 浩平さんの見本をもとに組み直し）
 * 左：メインの買い手（絵・名前・説明）とほかの候補／中：物件のポイント＝その買い手が重視しやすい項目の、この物件の値（2026-11-04 見出しを浩平さん指示で「物件のポイント」に。事実。lib/report.ts の targetPoints）と訴求のポイント（AI）／右：推奨方針（AI）とデータの注意点
 * 見本から変えたところ：右の「メインターゲット」は左と同じなので出さない。代表年齢は返済の計算に使う仮の値で、単身の「年代は問わない」と食い違うので出さない。
 * 物件のポイントに価格の割高・割安は入れない（価格の位置づけのラベルは6タブでは出さない決まり。価格は推奨方針の文と価格分析タブで見る）
 */
function BasicStrategy({ r, facts, factList, notes }: { r: StrategyResult; facts: Map<string, Fact>; factList: Fact[]; notes: number }) {
  const { goTab, openFact } = useReportNav();
  const m = r.戦略;
  const focus = salesFocusOf(m);
  const targets = [...m.targets].sort((a, b) => a.rank - b.rank);
  const main = targets[0];
  const others = targets.slice(1);
  const appeals = [...m.appeals].sort((a, b) => a.rank - b.rank).slice(0, 3);
  // 基本の候補は、その候補が重視しやすい点をこの物件の事実で出す。AIが加えた候補は表がないので、AIが根拠にした物件・立地の事実
  const fixed = main && main.source !== "エージェント提案" ? targetPoints(main.name, factList) : null;
  const points =
    fixed ??
    summaryFeatures({ ...m, targets: main ? [main] : [] }, facts).map((f) => ({ ...featureText(f), ids: [f.id] }));
  const image = main && main.source !== "エージェント提案" ? TARGET_IMAGES[main.name] : undefined;
  const definition = main ? targetDefinition(main, factList) : null;

  return (
    <section className="rounded-[10px] border border-line bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line pb-3">
        <span className="grid size-8 place-items-center rounded-lg bg-[#f1ecfb] text-[#6b4fc0]">
          <SparkIcon className="size-[18px]" />
        </span>
        <h2 className="text-[17px] font-bold text-ink">販売の基本戦略</h2>
        <span className="text-[12px] text-sub">この物件を「誰に、何を訴求して、どう売るか」の全体方針です。</span>
      </div>

      {focus && <SalesFocusBox focus={focus} facts={facts} />}

      <div className="grid gap-5 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* メインの買い手 */}
        <div className="min-w-0">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element -- public/ の絵をそのまま出す（next.config.ts で画像の最適化を止めている）
            <img src={image} alt={`${main?.name}のイメージ`} className="aspect-[2/1] w-full rounded-lg border border-line bg-[#e3f0fd] object-cover" />
          ) : (
            <div className="grid aspect-[2/1] w-full place-items-center rounded-lg border border-line bg-primary-soft/50 text-primary">
              <UsersIcon className="size-12" />
            </div>
          )}
          <div className="mt-3">
            <span className="inline-block rounded bg-[#f1ecfb] px-2 py-0.5 text-[11px] font-bold text-[#5b3fa8]">想定するメインの買い手</span>
          </div>
          {main ? (
            <>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="text-[22px] font-bold leading-tight text-ink">{main.name}</span>
                <HypothesisBadge />
              </div>
              {main.source === "エージェント提案" && <div className="mt-0.5 text-[12px] text-sub">基本の6候補にない、AIが加えた候補です。</div>}
              {definition && <p className="mt-1 text-[13px] leading-relaxed text-body">{definition}</p>}
              {others.length > 0 && (
                <div className="mt-2 text-[12px] text-sub">
                  ほかの候補：
                  {others.map((t, i) => (
                    <span key={`${t.rank}-${t.name}`}>
                      {i > 0 && "、"}
                      {RANK_NAME[t.rank - 1] ?? `第${t.rank}`} {t.name}
                    </span>
                  ))}
                  <button type="button" onClick={() => goTab("target")} className="ml-1.5 text-primary underline underline-offset-2 cursor-pointer">
                    理由を見る
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="mt-1 text-[13px] text-sub">ターゲットはありません。</div>
          )}
        </div>

        {/* 物件のポイント（事実）と訴求のポイント（AI） */}
        <div className="grid min-w-0 content-start gap-4 lg:border-x lg:border-line lg:px-5">
          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-[15px] font-bold text-ink">
              <HomeIcon className="size-[18px] text-primary" />
              物件のポイント
            </h3>
            <div className="mb-2 text-[12px] text-sub">
              {fixed && main ? `${main.name}が重視しやすい項目（調査から）を、この物件の値で示しています。` : "AIが根拠にした物件・立地の事実です。"}
            </div>
            {points.length === 0 ? (
              <div className="text-[13px] text-sub">出せる事実がありません。</div>
            ) : (
              <ul className="grid gap-1.5">
                {points.map((p) => {
                  const f = facts.get(p.ids[0]);
                  return (
                    <li key={p.ids.join("+") || p.label}>
                      <button
                        type="button"
                        onClick={() => openFact(p.ids[0])}
                        title={p.ids.map((id) => facts.get(id)).filter(Boolean).map((x) => `${x!.項目}：${x!.値}（${x!.出典}・${x!.時点}）`).join("\n")}
                        className="flex w-full items-start gap-2 text-left cursor-pointer group"
                      >
                        {/* アイコンは見出しの言葉で選ぶ（返済の行が「割合」の絵にならないように） */}
                        {f ? factIcon({ id: f.id, 項目: p.label }, "mt-0.5 size-4 shrink-0 text-primary") : null}
                        <span className="min-w-0 text-[14px] text-ink">
                          <span className="text-sub">{p.label}：</span>
                          <span className="font-bold group-hover:text-primary">{p.value}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="border-t border-line pt-4">
            <h3 className="mb-2 flex items-center gap-1.5 text-[15px] font-bold text-ink">
              <MegaphoneIcon className="size-[18px] text-[#6b4fc0]" />
              訴求のポイント
              <span className="text-[12px] font-normal text-sub">（販売での伝え方）</span>
            </h3>
            {appeals.length === 0 ? (
              <div className="text-[13px] text-sub">訴求のポイントはありません。</div>
            ) : (
              <ol className="grid gap-1.5">
                {appeals.map((a) => (
                  <li key={a.rank}>
                    <Ai size="sm">{a.text}</Ai>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        {/* 推奨方針（AI）とデータの注意点 */}
        <div className="grid min-w-0 content-start gap-3 md:col-span-2 lg:col-span-1">
          <div className="rounded-lg bg-primary-soft/60 px-4 py-3">
            <div className="mb-1 flex items-center gap-1 text-[12px] text-sub">
              推奨方針
              <SparkIcon className="size-3 text-[#6b4fc0]" />
            </div>
            <p className="text-[14px] font-bold leading-relaxed text-ink">{m.summary.text}</p>
            <Evidence ids={m.summary.evidence} facts={facts} max={0} />
          </div>
          <div className={`flex items-center gap-3 rounded-lg px-4 py-3 ${notes ? "bg-[#fdf1e7]" : "bg-primary-soft/60"}`}>
            <SearchIcon className={`size-5 ${notes ? "text-accent" : "text-primary"}`} />
            <div className="min-w-0">
              <div className="text-[12px] text-sub">データの注意点</div>
              <div className={`text-[14px] font-bold ${notes ? "text-accent" : "text-ink"}`}>{notes ? `${notes}件（下に一覧）` : "なし"}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const FOCUS_KIND_STYLE: Record<SalesFocus["kind"], string> = {
  強みを伝える: "bg-primary-soft text-primary",
  不安を取り除く: "bg-[#fdebd9] text-[#9a4a12]",
  確かめる: "bg-[#fdf1e7] text-accent",
};

/**
 * この物件でいちばん大事なこと（2026-11-05 妥当性チェックの結果から。AIの sales_focus）
 * 1文の結論と最初にやることを大きく出し、「なぜこの物件で」「なぜ先に」は開いて見る（印刷では開いたまま）
 * 2026-11-05 より前の答えには無いので、枠ごと出さない（作り直すと出る）
 * 見出し「この物件でいちばん大事なこと」は出さない（2026-11-05 浩平さん指示）。種類の札と「仮説」だけを付ける
 */
function SalesFocusBox({ focus, facts }: { focus: SalesFocus; facts: Map<string, Fact> }) {
  const reasons = (
    <dl className="mt-2 grid gap-2 text-[13px]">
      <div>
        <dt className="text-[12px] text-sub">この物件で大事な理由</dt>
        <dd>
          <Ai size="sm">{focus.why_this_property}</Ai>
        </dd>
      </div>
      <div>
        <dt className="text-[12px] text-sub">ほかの打ち出し方より先にやる理由</dt>
        <dd>
          <Ai size="sm">{focus.why_first}</Ai>
        </dd>
      </div>
      <dd>
        <Evidence ids={focus.evidence} facts={facts} max={4} />
      </dd>
    </dl>
  );
  return (
    <div className="mb-5 rounded-lg border border-[#d9cff3] bg-[#f8f6fd] px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${FOCUS_KIND_STYLE[focus.kind] ?? "bg-subtle text-sub"}`}>{focus.kind}</span>
        <HypothesisBadge />
      </div>
      <div className="mt-1.5">
        <Ai strong>{focus.point}</Ai>
      </div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-1 pl-[22px] text-[14px]">
        <span className="shrink-0 text-sub">最初にやること：</span>
        <span className="min-w-0 font-bold text-ink">{focus.action}</span>
      </div>
      <details className="mt-1 pl-[22px] print:hidden">
        <summary className="cursor-pointer text-[12px] text-primary underline">なぜこの物件で、なぜ先にやるのか</summary>
        {reasons}
      </details>
      <div className="hidden pl-[22px] print:block">{reasons}</div>
    </div>
  );
}

/** 懸念点の札（根拠の分類から決める。lib/report.ts の concernTopic） */
function TopicTag({ topic }: { topic: string | null }) {
  if (!topic) return null;
  return <span className="mb-1 inline-block rounded bg-[#fdebd9] px-1.5 py-0.5 text-[11px] font-bold text-[#9a4a12]">{topic}</span>;
}
