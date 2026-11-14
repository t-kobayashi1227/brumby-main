import { normalizeWidth, schoolFullName, type LotRange } from "../../../lib/facts/school-zones";
import { htmlTables, htmlText, tableRows } from "../lib/html-table";
import { defineJob, insertRows } from "../lib/runner";

// D41 長岡市の通学区域（町名・丁目 → 小学校・中学校）
// npm run ingest -- d41-nagaoka-school-zones
// 長岡市例規集の「長岡市立学校通学区域規則」（HTML）の別表第1（小学校・通学区域・中学校）と附表（町の一部の番地）を読み取る
// 市の案内ページ（kosodate/cate03/tetsuduki/tuugaku-kuiki.html）の PDF「別表第1」と同じ中身。HTML の方が表を読み取りやすい
// 規則（法令）なので著作権の対象外（著作権法第13条）。ページは data/raw/school-zones-nagaoka/ に保存する
// 通学区域の書き方：「台町1、2」は台町1丁目・2丁目。「学校町3の一部 (附表1に示す区域)」は3丁目のうち附表1の番地だけ、
// 「(附表10に示す区域を除く。)」は附表の番地を除いた残り。附表の番地を読み取れないときは、その町は番地で決めず「要確認」にする

export const NAGAOKA_URL = "https://www.city.nagaoka.niigata.jp/shisei/cate03/jyourei/reiki/reiki_honbun/e403RG00000241.html";

/** 通学区域の欄の1つの町（丁目ごと） */
export interface NagaokaArea {
  town: string;
  chome: number | null;
  scope: "全部" | "一部";
  /** 表のまま（例：学校町3の一部 (附表1に示す区域)） */
  text: string;
  /** 附表の番号と、除くかどうか。附表を使わない「一部」（「(仲島を除く。)」など）は null */
  appendix: { nos: number[]; except: boolean } | null;
  /** 欄の中の何番目の語か（同じ町の「1、2、3の一部」は同じ番号） */
  group: number;
}

/**
 * 別表第1の通学区域の欄を町・丁目に分ける
 * 「水道町1、2、3の一部 (附表5に示す区域を除く。) 、4の一部 (附表6に示す区域を除く。)」→ 水道町1・2（全部）、3・4（一部）
 * 空白のあとの数字だけの語（「福住2の一部 (…) 3」の3）は、前の町の丁目の続き
 */
export function parseNagaokaAreas(raw: string): NagaokaArea[] {
  const text = normalizeWidth(raw)
    .replace(/\s*\(\s*/g, "(")
    .replace(/\s*\)/g, ")")
    .replace(/。/g, "")
    .replace(/\s*、\s*/g, "、")
    .trim();
  const out: NagaokaArea[] = [];
  let town = "";
  let group = -1;
  // 「三ツ郷屋1、2、三ツ郷屋町」のように、「、」のあとに別の町名が続くことがある
  const items = text.split(" ").filter(Boolean).flatMap((item) => item.split(/、(?=[^\d、(の])/));
  for (const item of items) {
    let rest = item;
    group++;
    if (!/^\d/.test(item)) {
      const m = /^([^\d(、]+?)(?=\d|の一部|\(|$)/.exec(item);
      if (!m) throw new Error(`町名を読み取れません：「${item}」`);
      town = m[1];
      rest = item.slice(town.length);
    } else if (!town) {
      throw new Error(`町名の前に数字があります：「${item}」`);
    }
    for (const segment of rest === "" ? [""] : rest.split("、")) {
      const m = /^(\d+)?(の一部)?(?:\(([^()]*)\))?$/.exec(segment);
      if (!m) throw new Error(`通学区域の書き方を読み取れません：「${town}${segment}」（${raw}）`);
      const [, chome, part, note] = m;
      const appendix = note ? /^附表(\d+(?:及び\d+)*)[にの]示す区域(を除く)?$/.exec(note) : null;
      out.push({
        town,
        chome: chome ? Number(chome) : null,
        scope: part || note ? "一部" : "全部",
        text: `${town}${segment}`,
        appendix: appendix ? { nos: appendix[1].split("及び").map(Number), except: Boolean(appendix[2]) } : null,
        group,
      });
    }
  }
  return out;
}

/** 附表の1件。ranges は読み取れた番地の範囲（読み取れない書き方が1つでもあれば null） */
export interface NagaokaAppendix {
  no: number;
  town: string;
  chome: number | null;
  text: string;
  ranges: LotRange[] | null;
}

/**
 * 附表の1件を読む。「学校町3のうち 12番 13番 14番」「2番17から20、24」「3番2から6まで」「1986番から2325番まで」「173の2」
 * 甲・乙の付く地番、「(旧水道町区域のみ)」のような注記、「の一部」がある附表は、番地では決められないので ranges を null にする
 */
export function parseNagaokaAppendix(no: number, raw: string): NagaokaAppendix | null {
  const text = normalizeWidth(raw).replace(/\s*\(\s*/g, "(").replace(/\s*\)/g, ")").trim();
  if (text === "削除") return null;
  const head = /^([^\d(]+?)(\d+)?(\([^()]*\))?\s*のうち\s*(.*)$/.exec(text);
  if (!head) throw new Error(`附表${no}の町名を読み取れません：「${raw}」`);
  const [, town, chome, headNote, body] = head;
  const result = { no, town, chome: chome ? Number(chome) : null, text: raw.trim() };
  if (headNote || /[甲乙丙()]|の一部|及び/.test(body)) return { ...result, ranges: null };

  const ranges: LotRange[] = [];
  // current：直前の番。byBan は「N番」の書き方（住居表示）か、「NのM」の書き方（地番）か
  let current: LotRange | null = null;
  let byBan = true;
  const num = String.raw`(\d+)`;
  for (const token of body.split(/[\s、]+/).filter(Boolean)) {
    let m: RegExpExecArray | null;
    if ((m = new RegExp(`^${num}番から${num}番(?:まで)?$`).exec(token))) {
      current = null;
      ranges.push({ ban: [Number(m[1]), Number(m[2])] });
    } else if ((m = new RegExp(`^${num}番$`).exec(token))) {
      current = { ban: [Number(m[1]), Number(m[1])] };
      byBan = true;
      ranges.push(current);
    } else if ((m = new RegExp(`^${num}(番|の)${num}(?:から(?:${num}(?:番|の))?${num}(?:まで)?)?$`).exec(token))) {
      // 「N番a」「N番aからbまで」「NのaからNのbまで」：番 N の号（枝番）a〜b
      const ban = Number(m[1]);
      if (m[4] && Number(m[4]) !== ban) return { ...result, ranges: null };
      current = { ban: [ban, ban], go: [[Number(m[3]), Number(m[5] ?? m[3])]] };
      byBan = m[2] === "番";
      ranges.push(current);
    } else if ((m = new RegExp(`^${num}(?:から${num}(?:まで)?)?$`).exec(token)) && current && byBan) {
      // 前の番の号の続き（「2番17から20、24、26」の24・26、「4番 15、19」の15・19）
      current.go = [...(current.go ?? []), [Number(m[1]), Number(m[2] ?? m[1])]];
    } else if ((m = new RegExp(`^${num}$`).exec(token)) && (!current || !byBan)) {
      // 枝番の無い地番（「沖田2のうち 173の2 … 201 249」の201・249）
      current = { ban: [Number(m[1]), Number(m[1])] };
      byBan = false;
      ranges.push(current);
    } else {
      return { ...result, ranges: null };
    }
  }
  if (ranges.some((r) => r.ban[1] < r.ban[0] || r.go?.some(([a, b]) => b < a))) return { ...result, ranges: null };
  return { ...result, ranges: ranges.length ? ranges : null };
}

/**
 * 「稲保南1、2、3の一部 (附表51に示す区域を除く。)」は、附表51が稲保南1なので、一部なのは1丁目（2・3丁目は全部）
 * このように附表の丁目が同じ語の別の丁目を指すときは、「一部」と附表をその丁目に移す
 */
export function moveAppendixToItsChome(areas: NagaokaArea[], appendices: Map<number, NagaokaAppendix>): NagaokaArea[] {
  const out = areas.map((a) => ({ ...a }));
  for (const area of out) {
    if (!area.appendix) continue;
    const entries = area.appendix.nos.map((n) => appendices.get(n)).filter(Boolean) as NagaokaAppendix[];
    const chomes = new Set(entries.filter((e) => e.town === area.town).map((e) => e.chome));
    if (chomes.size !== 1 || chomes.has(area.chome)) continue;
    const [chome] = chomes;
    const sibling = out.find((a) => a.group === area.group && a.town === area.town && a.chome === chome && a.scope === "全部");
    if (!sibling) continue;
    sibling.scope = "一部";
    sibling.appendix = area.appendix;
    sibling.text = `${sibling.text}（${area.text}の附表）`;
    area.scope = "全部";
    area.appendix = null;
  }
  return out;
}

/** 町の行に附表の番地を当てる。附表の町・丁目が行と違うもの（「附表36及び49」の49は別の町）は使わない */
export function rangesFor(area: NagaokaArea, appendices: Map<number, NagaokaAppendix>): LotRange[] | { except: LotRange[] } | null {
  if (!area.appendix) return null;
  const list = area.appendix.nos.map((n) => appendices.get(n)).filter((a) => a && a.town === area.town && a.chome === area.chome) as NagaokaAppendix[];
  if (list.length === 0 || list.some((a) => a.ranges === null)) return null;
  const ranges = list.flatMap((a) => a.ranges!);
  return area.appendix.except ? { except: ranges } : ranges;
}

/** 例規集のページから、別表第1（小学校・通学区域・中学校の行）と附表を読む */
export function parseNagaokaPage(html: string): { rows: { elementary: string; areas: string; juniorHigh: string }[]; appendices: Map<number, NagaokaAppendix> } {
  const tables = htmlTables(html).map(tableRows);
  const main = tables.find((t) => t.some((r) => r.join("|") === "小学校|通学区域|中学校"));
  if (!main) throw new Error("別表第1（小学校・通学区域・中学校の表）が見つかりません。ページの作りが変わった可能性があります");
  const rows = main
    .filter((r) => r.length === 3 && r[0] && r[0] !== "小学校")
    .map(([elementary, areas, juniorHigh]) => ({ elementary: schoolFullName(elementary), areas, juniorHigh: schoolFullName(juniorHigh) }));
  const appendixTable = tables.find((t) => t.filter((r) => r.length === 2 && /^\d+$/.test(r[0]) && /のうち|^削除$/.test(r[1])).length >= 10);
  if (!appendixTable) throw new Error("附表（町の一部の番地の表）が見つかりません。ページの作りが変わった可能性があります");
  const appendices = new Map<number, NagaokaAppendix>();
  for (const [no, body] of appendixTable) {
    if (!/^\d+$/.test(no)) continue;
    const a = parseNagaokaAppendix(Number(no), body);
    if (a) appendices.set(a.no, a);
  }
  return { rows, appendices };
}

interface Prepared {
  html: string;
}

export const d41NagaokaSchoolZones = defineJob<Prepared>({
  datasets: ["D41"],
  rawDir: "school-zones-nagaoka",
  table: "school_zone_rules_all",
  options: [],

  async prepare({ raw, setAsOf }) {
    const html = new TextDecoder("utf-8").decode(await raw.download(NAGAOKA_URL, "e403RG00000241.html"));
    // 時点は沿革の一番新しい改正日（例：令和7年3月27日）
    const revisions = [...htmlText(html).matchAll(/◇ ?((?:令和|平成)\d+年\d+月\d+日)/g)].map((m) => m[1]);
    if (revisions.length) setAsOf("D41", `${revisions[revisions.length - 1]}改正の規則（長岡市例規集）`);
    return { html };
  },

  async load({ sql, prepared, log, check }) {
    const { rows: tableRowsList, appendices } = parseNagaokaPage(prepared.html);
    const rows: Record<string, unknown>[] = [];
    let partial = 0;
    let unparsed = 0;
    for (const r of tableRowsList) {
      for (const area of moveAppendixToItsChome(parseNagaokaAreas(r.areas), appendices)) {
        const ranges = area.scope === "一部" ? rangesFor(area, appendices) : null;
        if (area.scope === "一部") {
          partial++;
          if (ranges === null) unparsed++;
        }
        const appendixText = area.appendix?.nos.map((n) => appendices.get(n)?.text ?? `附表${n}`).join("／");
        const lotText = area.scope === "全部" ? "全部" : appendixText ? `${area.appendix!.except ? "次を除く：" : ""}${appendixText}` : area.text;
        rows.push({
          dataset_id: "D41",
          city_code: "15202",
          ward: null,
          town: area.town,
          chome: area.chome,
          town_text: area.text,
          lot_scope: area.scope,
          lot_text: lotText,
          lot_ranges: ranges === null ? null : sql.json(ranges as never),
          elementary_school: r.elementary,
          junior_high_school: r.juniorHigh,
          source_url: NAGAOKA_URL,
        });
      }
    }
    await insertRows(sql, "school_zone_rules_all", rows);
    const schools = new Set(tableRowsList.map((r) => r.elementary));
    log(`小学校${schools.size}校・${tableRowsList.length}行から ${rows.length}行を入れました（町の一部：${partial}行、うち番地を読み取れなかった行：${unparsed}）`);
    if (schools.size < 40) throw new Error(`小学校が${schools.size}校しかありません。ページの作りが変わった可能性があります`);
    check("小学校の数", schools.size);
    check("番地を読み取れなかった行", unparsed);
  },
});
