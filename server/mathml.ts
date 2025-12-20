import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { CHTML } from 'mathjax-full/js/output/chtml.js';
import { SerializedMmlVisitor } from 'mathjax-full/js/core/MmlTree/SerializedMmlVisitor.js';
import { HTMLMathItem } from 'mathjax-full/js/handlers/html/HTMLMathItem.js';

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

const tex = new TeX({
  packages: AllPackages,
  inlineMath: [['$', '$'], ['\\(', '\\)']],
  displayMath: [['$$', '$$'], ['\\[', '\\]']],
  processEscapes: true,
  processEnvironments: true
});

// OutputJax is still required by MathDocument, though we only read the compiled Mml tree.
const chtml = new CHTML();
const html = mathjax.document('', {
  InputJax: tex,
  OutputJax: chtml
});
const visitor = new SerializedMmlVisitor();

/**
 * Detect whether the LaTeX content should be treated as display math.
 * Helps both MathJax conversion and front-end rendering stay consistent.
 */
export function isDisplayLatex(latex: string): boolean {
  if (!latex) return false;
  return /\\begin|\\\\|\n|\\dfrac|\\displaystyle|\\int|\\sum/.test(latex);
}

export function normalizeLatex(latex: string): string {
  if (!latex) return '';

  let result = '';
  let index = 0;

  while (index < latex.length) {
    const match = matchLeftScripts(latex, index);

    if (match) {
      const base = readBaseToken(latex, match.nextIndex);

      if (base && !shouldSkipBase(base.token)) {
        result += `${base.whitespace}\\prescript${wrapWithBraces(match.sup)}${wrapWithBraces(match.sub)}${wrapWithBraces(base.token)}`;
        index = base.end;
        continue;
      }

      const fallbackEnd = base ? base.end : match.nextIndex;
      result += latex.slice(index, fallbackEnd);
      index = fallbackEnd;
      continue;
    }

    result += latex[index];
    index += 1;
  }

  return result;
}

/**
 * Convert LaTeX string to MathML markup.
 * Returns empty string when conversion fails.
 */
export function convertLatexToMathML(latex: string, displayOverride?: boolean): string {
  if (!latex?.trim()) {
    return '';
  }

  const display = typeof displayOverride === 'boolean' ? displayOverride : isDisplayLatex(latex);

  try {
    const mathItem = new HTMLMathItem(latex, tex, display);

    // Match MathDocument defaults so spacing and sizing behave like regular rendering.
    const ex = 8;
    mathItem.setMetrics(16, ex, 80 * ex, 1000000, 1);
    mathItem.compile(html);

    if (!mathItem.root) {
      return '';
    }

    return visitor.visitTree(mathItem.root);
  } catch (error) {
    console.error('[MathML] Conversion failed:', error);
    return '';
  }
}

interface ScriptMatch {
  sub: string;
  sup: string;
  nextIndex: number;
}

interface ScriptResult {
  type: '_' | '^';
  value: string;
  end: number;
}

interface GroupResult {
  content: string;
  end: number;
}

interface BaseTokenResult {
  token: string;
  end: number;
  whitespace: string;
}

function matchLeftScripts(source: string, start: number): ScriptMatch | null {
  if (source[start] !== '{' || source[start + 1] !== '}') {
    return null;
  }

  let cursor = start + 2;
  const length = source.length;

  while (cursor < length && /\s/.test(source[cursor])) {
    cursor += 1;
  }

  const first = readScript(source, cursor);
  if (!first) return null;

  cursor = first.end;
  while (cursor < length && /\s/.test(source[cursor])) {
    cursor += 1;
  }

  const second = readScript(source, cursor);
  if (!second) return null;

  const types = `${first.type}${second.type}`;
  if (!(types.includes('_') && types.includes('^'))) {
    return null;
  }

  const sub = first.type === '_' ? first.value : second.value;
  const sup = first.type === '^' ? first.value : second.value;

  return { sub, sup, nextIndex: second.end };
}

function readScript(source: string, start: number): ScriptResult | null {
  const indicator = source[start];
  if (indicator !== '_' && indicator !== '^') {
    return null;
  }

  let cursor = start + 1;
  const length = source.length;

  while (cursor < length && /\s/.test(source[cursor])) {
    cursor += 1;
  }

  if (cursor >= length) return null;

  if (source[cursor] === '{') {
    const group = readGroup(source, cursor);
    if (!group) return null;
    return { type: indicator as '_' | '^', value: group.content, end: group.end };
  }

  if (source[cursor] === '\\') {
    const match = source.slice(cursor).match(/^\\[a-zA-Z]+/);
    if (!match) return null;
    return {
      type: indicator as '_' | '^',
      value: match[0],
      end: cursor + match[0].length
    };
  }

  return {
    type: indicator as '_' | '^',
    value: source[cursor],
    end: cursor + 1
  };
}

function readGroup(source: string, start: number): GroupResult | null {
  if (source[start] !== '{') return null;

  let depth = 0;
  for (let idx = start; idx < source.length; idx += 1) {
    const char = source[idx];

    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return { content: source.slice(start + 1, idx), end: idx + 1 };
      }
    } else if (char === '\\') {
      idx += 1;
    }
  }

  return null;
}

function readBaseToken(source: string, start: number): BaseTokenResult | null {
  let cursor = start;
  let whitespace = '';

  while (cursor < source.length && /\s/.test(source[cursor])) {
    whitespace += source[cursor];
    cursor += 1;
  }

  if (cursor >= source.length) {
    return null;
  }

  if (source[cursor] === '\\') {
    const match = source.slice(cursor).match(/^\\[a-zA-Z]+/);
    if (!match) return null;

    let end = cursor + match[0].length;
    let token = source.slice(cursor, end);

    if (source[end] === '{') {
      const group = readGroup(source, end);
      if (group) {
        token = source.slice(cursor, group.end);
        end = group.end;
      }
    }

    return { token, end, whitespace };
  }

  if (source[cursor] === '{') {
    const group = readGroup(source, cursor);
    if (!group) return null;
    return { token: source.slice(cursor, group.end), end: group.end, whitespace };
  }

  return { token: source[cursor], end: cursor + 1, whitespace };
}

function wrapWithBraces(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '{}';
  }

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }

  return `{${trimmed}}`;
}

function shouldSkipBase(token: string): boolean {
  const trimmed = token.trim();
  if (!trimmed) return true;
  const disallowed = ['\\left', '\\right', '\\big', '\\Big', '\\bigg', '\\Bigg'];
  return disallowed.some(prefix => trimmed.startsWith(prefix));
}
