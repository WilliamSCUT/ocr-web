import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { MathML } from 'mathjax-full/js/output/mathml.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

const tex = new TeX({
  packages: AllPackages,
  inlineMath: [['$', '$'], ['\\(', '\\)']],
  displayMath: [['$$', '$$'], ['\\[', '\\]']],
  processEscapes: true,
  processEnvironments: true
});

const mml = new MathML();
const html = mathjax.document('', {
  InputJax: tex,
  OutputJax: mml
});

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
    const node = html.convert(latex, { display });
    return adaptor.outerHTML(node);
  } catch (error) {
    console.error('[MathML] Conversion failed:', error);
    return '';
  }
}

