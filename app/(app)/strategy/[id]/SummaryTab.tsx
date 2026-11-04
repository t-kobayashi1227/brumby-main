"use client";

import type { StrategyResult } from "../../../../lib/agents/run";
import type { AreaMapData } from "../../../../lib/area-map";
import type { AreaPriceResult } from "../../../../lib/area-price";
import type { Fact } from "../../../../lib/facts/types";
import { concernTopic, factsToCheck, featureText, nextCheck, shortLabel, summaryFeatures, TARGET_IMAGES, targetDefinition, usedFactIds } from "../../../../lib/report";
import { AlertIcon, ClipboardIcon, HomeIcon, MegaphoneIcon, SearchIcon, SparkIcon, UsersIcon } from "../../../_components/icons";
import { Ai, Card, Evidence, factIcon, HypothesisBadge, Num, useReportNav } from "./parts";
import AreaMap from "./AreaMap";
import AreaPrice from "./AreaPrice";
import PromptLog from "./PromptLog";

// ① サマリー：販売の基本戦略（メインの買い手・物件の特徴・訴求のポイント・推奨方針。2026-11-04 浩平さん依頼で推奨方針の枠を組み直し）→ 地図と区の価格相場（2カラム、2026-11-03 追加）→ 懸念点 → 次に確かめること → AIに送った内容（最初は閉じておく）
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
 * 左：メインの買い手（絵・名前・説明）とほかの候補／中：この物件の特徴（事実）と訴求のポイント（AI）／右：推奨方針（AI）とデータの注意点
 * 見本から変えたところ：右の「メインターゲット」は左と同じなので出さない。代表年齢は返済の計算に使う仮の値で、単身の「年代は問わない」と食い違うので出さない。
 * 特徴に価格の割高・割安は入れない（価格の位置づけのラベルは6タブでは出さない決まり。価格は推奨方針の文と価格分析タブで見る）
 */
function BasicStrategy({ r, facts, factList, notes }: { r: StrategyResult; facts: Map<string, Fact>; factList: Fact[]; notes: number }) {
  const { goTab, openFact } = useReportNav();
  const m = r.戦略;
  const targets = [...m.targets].sort((a, b) => a.rank - b.rank);
  const main = targets[0];
  const others = targets.slice(1);
  const appeals = [...m.appeals].sort((a, b) => a.rank - b.rank).slice(0, 3);
  const features = summaryFeatures(m, facts);
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

      <div className="grid gap-5 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* メインの買い手 */}
        <div className="min-w-0">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element -- public/ の絵をそのまま出す（next.config.ts で画像の最適化を止めている）
            <img src={image} alt={`${main?.name}のイメージ`} className="aspect-[6/5] w-full rounded-lg border border-line object-cover object-[50%_75%]" />
          ) : (
            <div className="grid aspect-[6/5] w-full place-items-center rounded-lg border border-line bg-primary-soft/50 text-primary">
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

        {/* この物件の特徴（事実）と訴求のポイント（AI） */}
        <div className="grid min-w-0 content-start gap-4 lg:border-x lg:border-line lg:px-5">
          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-[15px] font-bold text-ink">
              <HomeIcon className="size-[18px] text-primary" />
              この物件の特徴
            </h3>
            {features.length === 0 ? (
              <div className="text-[13px] text-sub">訴求の根拠になった物件・立地の事実はありません。</div>
            ) : (
              <ul className="grid gap-1.5">
                {features.map((f) => {
                  const t = featureText(f);
                  return (
                    <li key={f.id}>
                      <button type="button" onClick={() => openFact(f.id)} title={`${f.項目}\n${f.値}\n出典：${f.出典}（${f.時点}）`} className="flex w-full items-start gap-2 text-left cursor-pointer group">
                        {factIcon(f, "mt-0.5 size-4 shrink-0 text-primary")}
                        <span className="min-w-0 text-[14px] text-ink">
                          <span className="text-sub">{t.label}：</span>
                          <span className="font-bold group-hover:text-primary">{t.value}</span>
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

/** 懸念点の札（根拠の分類から決める。lib/report.ts の concernTopic） */
function TopicTag({ topic }: { topic: string | null }) {
  if (!topic) return null;
  return <span className="mb-1 inline-block rounded bg-[#fdebd9] px-1.5 py-0.5 text-[11px] font-bold text-[#9a4a12]">{topic}</span>;
}
