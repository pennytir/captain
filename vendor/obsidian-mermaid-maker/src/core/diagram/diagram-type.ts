/**
 * Atom-DiagramTypeDetector
 *
 * Mermaid テキストの冒頭から diagram type を判定する純関数。
 * Canvas dispatcher が「どの sub-canvas に渡すか」を決める起点。
 *
 * 設計: ../../../50_Mission/zddmission/MermaidMaker/Atom-DiagramTypeDetector.md
 */

/**
 * Mermaid v11 系で公式サポートされる全 diagram type の列挙。
 *
 * 値数の整理:
 * - Mermaid 公式 diagram 分類: stable 15 + beta 7 + 3rd-party 1 = 23 種
 * - 本列挙値数: C4 を 5 サブに展開しているため 27 値 + 'unknown' = 28 値
 */
export type DiagramType =
  | 'flowchart'           // `graph` / `flowchart`
  | 'sequenceDiagram'
  | 'classDiagram'        // `classDiagram` / `classDiagram-v2`
  | 'stateDiagram'        // `stateDiagram` / `stateDiagram-v2`
  | 'erDiagram'
  | 'journey'
  | 'gantt'
  | 'pie'
  | 'quadrantChart'
  | 'requirementDiagram'
  | 'gitGraph'            // `gitGraph` / `gitgraph`
  | 'mindmap'
  | 'timeline'
  | 'C4Context'
  | 'C4Container'
  | 'C4Component'
  | 'C4Dynamic'
  | 'C4Deployment'
  | 'kanban'
  | 'sankey-beta'
  | 'xychart-beta'
  | 'block-beta'
  | 'packet-beta'
  | 'architecture-beta'
  | 'radar-beta'
  | 'treemap-beta'
  | 'zenuml'
  | 'unknown';

/**
 * ヘッダ先頭トークン → DiagramType マッピング (完全一致)
 */
const TOKEN_TO_TYPE: Record<string, DiagramType> = {
  graph: 'flowchart',
  flowchart: 'flowchart',
  sequenceDiagram: 'sequenceDiagram',
  classDiagram: 'classDiagram',
  'classDiagram-v2': 'classDiagram',
  stateDiagram: 'stateDiagram',
  'stateDiagram-v2': 'stateDiagram',
  erDiagram: 'erDiagram',
  journey: 'journey',
  gantt: 'gantt',
  pie: 'pie',
  quadrantChart: 'quadrantChart',
  requirementDiagram: 'requirementDiagram',
  gitGraph: 'gitGraph',
  gitgraph: 'gitGraph',
  mindmap: 'mindmap',
  timeline: 'timeline',
  C4Context: 'C4Context',
  C4Container: 'C4Container',
  C4Component: 'C4Component',
  C4Dynamic: 'C4Dynamic',
  C4Deployment: 'C4Deployment',
  kanban: 'kanban',
  'sankey-beta': 'sankey-beta',
  'xychart-beta': 'xychart-beta',
  'block-beta': 'block-beta',
  'packet-beta': 'packet-beta',
  'architecture-beta': 'architecture-beta',
  'radar-beta': 'radar-beta',
  'treemap-beta': 'treemap-beta',
  zenuml: 'zenuml',
};

/**
 * 行がスキップ対象か。
 * - 空行
 * - `%%` で始まる行（`%%{init: ...}%%` ディレクティブを含む）
 */
function isSkippable(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === '') return true;
  if (trimmed.startsWith('%%')) return true;
  return false;
}

/**
 * Mermaid テキストの冒頭から diagram type を判定する純関数。
 *
 * 判定手順:
 * 1. 行を split し、空行 / コメント / init ディレクティブをスキップ
 * 2. 最初の非スキップ行 (= ヘッダ行) を取得
 * 3. ヘッダ行を trim 後、空白で先頭トークンを切出し
 * 4. TOKEN_TO_TYPE と完全一致テスト
 * 5. 不一致は 'unknown'
 *
 * 本文の文法は見ない。判定は冒頭 1 行のキーワードのみ。
 */
export function parseDiagramHeader(text: string): DiagramType {
  const lines = text.split('\n');
  for (const line of lines) {
    if (isSkippable(line)) continue;
    const trimmed = line.trim();
    // 空白で先頭トークン抽出（空白がない場合は行全体）
    const firstSpace = trimmed.search(/\s/);
    const token = firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace);
    return TOKEN_TO_TYPE[token] ?? 'unknown';
  }
  return 'unknown';
}
