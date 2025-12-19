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
