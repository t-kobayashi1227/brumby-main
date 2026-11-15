// 市のホームページ・例規集の HTML の表を読む（通学区域の取り込みで使う）

/** タグを外し、文字参照を戻し、空白を1つにまとめる */
export function htmlText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/[\s　]+/g, " ")
    .trim();
}

/** HTML の中の表をすべて取り出す */
export function htmlTables(html: string): string[] {
  return html.match(/<table[\s\S]*?<\/table>/gi) ?? [];
}

/**
 * 表の行を、セルの文字の配列にする。縦につないだセル（rowspan）は、つながる行にも同じ文字を入れる
 * th と td はどちらもセルとして読む。セルが1つも無い行は飛ばす
 */
export function tableRows(table: string): string[][] {
  const rows: string[][] = [];
  const carry = new Map<number, { text: string; left: number }>();
  for (const tr of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...tr[1].matchAll(/<t([dh])([^>]*)>([\s\S]*?)<\/t[dh]>/gi)];
    if (cells.length === 0) continue;
    const row: string[] = [];
    const fillCarried = () => {
      for (let c = carry.get(row.length); c && c.left > 0; c = carry.get(row.length)) {
        row.push(c.text);
        c.left--;
      }
    };
    fillCarried();
    for (const [, , attrs, body] of cells) {
      const text = htmlText(body);
      const span = /rowspan\s*=\s*"?(\d+)/i.exec(attrs);
      if (span && Number(span[1]) > 1) carry.set(row.length, { text, left: Number(span[1]) - 1 });
      row.push(text);
      fillCarried();
    }
    rows.push(row);
  }
  return rows;
}
