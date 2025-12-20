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
  const cleaned = cleanEnvironments(latex);
  const withLeftScripts = rewriteLeftScripts(cleaned);
  return normalizeDerivatives(withLeftScripts);
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

    const rawMathML = visitor.visitTree(mathItem.root);
    return postProcessMathML(rawMathML);
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

interface DerivativeCommand {
  order: number;
  nextIndex: number;
}

function matchLeftScripts(source: string, start: number): ScriptMatch | null {
  const length = source.length;
  let cursor = start;
  const scripts: ScriptResult[] = [];

  if (source[start] === '{' && source[start + 1] === '}') {
    cursor = start + 2;
    while (cursor < length && /\s/.test(source[cursor])) {
      cursor += 1;
    }
  } else if (source[start] === '^' || source[start] === '_') {
    if (start > 0 && !/[\s([{=+\-*/]/.test(source[start - 1])) {
      return null;
    }
  } else {
    return null;
  }

  for (let i = 0; i < 2; i += 1) {
    const script = readScript(source, cursor);
    if (!script) break;
    scripts.push(script);
    cursor = script.end;

    while (cursor < length && /\s/.test(source[cursor])) {
      cursor += 1;
    }
  }

  if (scripts.length === 0) return null;

  let sub = '';
  let sup = '';
  for (const script of scripts) {
    if (script.type === '_') {
      sub = script.value;
    } else if (script.type === '^') {
      sup = script.value;
    }
  }

  return { sub, sup, nextIndex: cursor };
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

    const scripts = collectAttachedScripts(source, end);
    return { token: `${token}${scripts.text}`, end: scripts.end, whitespace };
  }

  if (source[cursor] === '{') {
    const group = readGroup(source, cursor);
    if (!group) return null;
    const scripts = collectAttachedScripts(source, group.end);
    return { token: `${source.slice(cursor, group.end)}${scripts.text}`, end: scripts.end, whitespace };
  }

  const scripts = collectAttachedScripts(source, cursor + 1);
  return { token: source[cursor], end: scripts.end, whitespace };
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

function collectAttachedScripts(source: string, start: number): { text: string; end: number } {
  let cursor = start;
  let text = '';

  while (cursor < source.length) {
    let lookahead = cursor;
    while (lookahead < source.length && /\s/.test(source[lookahead])) {
      lookahead += 1;
    }

    const script = readScript(source, lookahead);
    if (!script) {
      break;
    }

    text += source.slice(cursor, lookahead);
    text += `${script.type}${wrapWithBraces(script.value)}`;
    cursor = script.end;
  }

  return { text, end: cursor };
}

function detectDerivativeCommand(source: string, start: number): DerivativeCommand | null {
  const ddot = '\\ddot';
  const dot = '\\dot';

  if (source.startsWith(ddot, start) && !/[a-zA-Z]/.test(source[start + ddot.length] || '')) {
    return { order: 2, nextIndex: start + ddot.length };
  }

  if (source.startsWith(dot, start) && !/[a-zA-Z]/.test(source[start + dot.length] || '')) {
    return { order: 1, nextIndex: start + dot.length };
  }

  return null;
}

function readDerivativeTarget(source: string, start: number): BaseTokenResult | null {
  let cursor = start;

  while (cursor < source.length && /\s/.test(source[cursor])) {
    cursor += 1;
  }

  if (cursor >= source.length) {
    return null;
  }

  if (source[cursor] === '{') {
    const group = readGroup(source, cursor);
    if (!group) return null;
    return { token: source.slice(cursor, group.end), end: group.end, whitespace: '' };
  }

  if (source[cursor] === '\\') {
    const match = source.slice(cursor).match(/^\\[a-zA-Z]+/);
    if (!match) return null;

    let end = cursor + match[0].length;

    if (source[end] === '{') {
      const group = readGroup(source, end);
      if (group) {
        end = group.end;
      }
    }

    const scripts = collectAttachedScripts(source, end);
    return { token: source.slice(cursor, scripts.end), end: scripts.end, whitespace: '' };
  }

  const scripts = collectAttachedScripts(source, cursor + 1);
  return { token: source.slice(cursor, scripts.end), end: scripts.end, whitespace: '' };
}

function postProcessMathML(mathml: string): string {
  const namespaceEnforced = ensureMathNamespace(mathml);
  const accentHandled = enforceMoverAccents(namespaceEnforced);
  const placeholderReplaced = replaceNonePlaceholders(accentHandled);
  const emptyRemoved = removeEmptyNodes(placeholderReplaced);
  return stripUnsupportedAttributes(emptyRemoved);
}

function cleanEnvironments(latex: string): string {
  let result = latex.replace(/\\limits\b/g, '');

  result = result.replace(/\\bm\s*{([^}]*)}/g, (_match, content) => `\\mathbf{${content}}`);
  result = result.replace(/\\bm\s+([A-Za-z])/g, (_match, symbol) => `\\mathbf{${symbol}}`);

  result = result.replace(/\\text\s*{([^}]*)}/g, (_match, content) => {
    const normalized = content.replace(/\s+/g, ' ').trim();
    return normalized ? `\\text{${normalized}}` : '\\text{}';
  });

  return result;
}

function ensureMathNamespace(mathml: string): string {
  return mathml.replace(/<math(?![^>]*xmlns=)/, '<math xmlns="http://www.w3.org/1998/Math/MathML"');
}

function enforceMoverAccents(mathml: string): string {
  const dotPattern = /<mo[^>]*>(?:\u02D9|\u00A8|&#x02D9;|&#x00A8;|&Dot;|&DoubleDot;)</mo>/;
  return mathml.replace(/<mover([^>]*)>([\s\S]*?)<\/mover>/g, (match, attrs, content) => {
    if (!dotPattern.test(content)) {
      return match;
    }

    if (/\saccent\s*=/.test(attrs)) {
      return match;
    }

    const newAttrs = `${attrs} accent="true"`;
    return `<mover${newAttrs}>${content}</mover>`;
  });
}

function replaceNonePlaceholders(mathml: string): string {
  return mathml.replace(/<none\s*\/>/g, '<mtext>&#x200B;</mtext>');
}

function removeEmptyNodes(mathml: string): string {
  let result = mathml.replace(/<mrow\b[^>]*>\s*<\/mrow>/g, '');
  result = result.replace(/<mtd\b[^>]*>\s*<\/mtd>/g, '');
  result = result.replace(/<mtext\b[^>]*>\s*<\/mtext>/g, '<mtext>&#x200B;</mtext>');
  return result;
}

function stripUnsupportedAttributes(mathml: string): string {
  return mathml.replace(/\s+(?:display|indentalign|indentshift|indentalignfirst|indentalignlast|indenttarget)="[^"]*"/g, '');
}

function rewriteLeftScripts(latex: string): string {
  let result = '';
  let index = 0;

  while (index < latex.length) {
    const match = matchLeftScripts(latex, index);

    if (match) {
      const base = readBaseToken(latex, match.nextIndex);

      if (base && !shouldSkipBase(base.token)) {
        const subValue = match.sub || '\\mathstrut';
        const supValue = match.sup || '\\mathstrut';
        result += `${base.whitespace}\\hspace{0pt}\\prescript${wrapWithBraces(supValue)}${wrapWithBraces(subValue)}${wrapWithBraces(base.token)}`;
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

function normalizeDerivatives(latex: string): string {
  let result = '';
  let index = 0;

  while (index < latex.length) {
    const derivative = detectDerivativeCommand(latex, index);

    if (derivative) {
      const target = readDerivativeTarget(latex, derivative.nextIndex);

      if (target) {
        const accentChar = derivative.order === 1 ? '\u02D9' : '\u00A8';
        result += `\\overset{${accentChar}}${wrapWithBraces(target.token)}`;
        index = target.end;
        continue;
      }
    }

    result += latex[index];
    index += 1;
  }

  return result;
}
