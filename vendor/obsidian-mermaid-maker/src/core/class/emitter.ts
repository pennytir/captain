/**
 * Atom-ClassEmitter (M12.1)
 *
 * ClassDiagram AST → Mermaid classDiagram テキスト 純関数。
 * Parser とのラウンドトリップ維持を保証する。
 *
 * 設計: ../../../50_Mission/zddmission/MermaidMaker/Atom-ClassEmitter.md
 */

import type {
  ClassDiagram,
  ClassMember,
  ClassRelationKind,
  ClassVisibility,
} from '../types/class-schema.js';

const INDENT = '    ';

const VISIBILITY_TOKEN: Record<ClassVisibility, string> = {
  public: '+',
  private: '-',
  protected: '#',
  package: '~',
};

const KIND_TO_TOKEN: Record<ClassRelationKind, string> = {
  inheritance: '--|>', // from extends to
  realization: '..|>',
  composition: '*--',
  aggregation: 'o--',
  association: '-->',
  dependency: '..>',
  link: '--',
};

function emitMember(member: ClassMember): string {
  const vis = VISIBILITY_TOKEN[member.visibility];
  if (member.kind === 'field') {
    const typePart = member.type ? `${member.type} ` : '';
    return `${vis}${typePart}${member.name}`;
  }
  // method
  const paramStr = member.params
    .map((p) => (p.type ? `${p.type} ${p.name}` : p.name))
    .join(', ');
  const ret = member.returnType ? ` ${member.returnType}` : '';
  return `${vis}${member.name}(${paramStr})${ret}`;
}

export function emitClassDiagram(diagram: ClassDiagram): string {
  const lines: string[] = ['classDiagram'];
  // M12.4: direction (header 直後)
  if (diagram.direction) {
    lines.push(`${INDENT}direction ${diagram.direction}`);
  }
  // M12.4: namespace に内包される class を別 set 化
  const inNamespace = new Set<string>();
  for (const ns of diagram.namespaces ?? []) {
    for (const id of ns.classIds) inNamespace.add(id);
  }
  // namespace block を先に出力 (内包 class を括る)
  for (const ns of diagram.namespaces ?? []) {
    lines.push(`${INDENT}namespace ${ns.name} {`);
    for (const id of ns.classIds) {
      const cls = diagram.classes.find((c) => c.id === id);
      if (!cls) continue;
      // namespace 内では宣言のみ (members は外で sticky 形式で出す)
      const genericPart = cls.generic ? `~${cls.generic}~` : '';
      lines.push(`${INDENT}${INDENT}class ${cls.id}${genericPart}`);
    }
    lines.push(`${INDENT}}`);
  }
  // top-level classes (namespace に含まれない) は class declaration、namespace 内 class は declaration 済なので skip。
  // annotation / members は namespace 内外問わず全 class について sticky 形式で出力。
  for (const cls of diagram.classes) {
    const genericPart = cls.generic ? `~${cls.generic}~` : '';
    if (!inNamespace.has(cls.id)) {
      lines.push(`${INDENT}class ${cls.id}${genericPart}`);
    }
    if (cls.annotation) {
      lines.push(`${INDENT}<<${cls.annotation}>> ${cls.id}`);
    }
    for (const m of cls.members) {
      lines.push(`${INDENT}${cls.id} : ${emitMember(m)}`);
    }
  }
  // relationships
  for (const rel of diagram.relations) {
    const token = KIND_TO_TOKEN[rel.kind];
    const labelPart = rel.label ? ` : ${rel.label}` : '';
    lines.push(`${INDENT}${rel.from} ${token} ${rel.to}${labelPart}`);
  }
  // M12.3a: notes
  if (diagram.notes) {
    for (const note of diagram.notes) {
      if (note.forClassId) {
        lines.push(`${INDENT}note "${note.label}" for ${note.forClassId}`);
      } else {
        lines.push(`${INDENT}note "${note.label}"`);
      }
    }
  }
  // M12.4: extras (click / cssClass / callback / style) — raw line をそのまま末尾に出力
  if (diagram.extras) {
    for (const ex of diagram.extras) {
      lines.push(`${INDENT}${ex.raw}`);
    }
  }
  return lines.join('\n');
}
