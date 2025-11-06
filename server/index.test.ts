import { describe, it, expect } from 'vitest';
import { extractLatex, buildPayload } from './index.js';

describe('extractLatex', () => {
  it('should extract content from $$...$$', () => {
    const input = 'Here is the formula: $$E=mc^2$$';
    expect(extractLatex(input)).toBe('E=mc^2');
  });

  it('should extract content from \\[...\\]', () => {
    const input = 'The formula is \\[x^2 + y^2 = r^2\\]';
    expect(extractLatex(input)).toBe('x^2 + y^2 = r^2');
  });

  it('should prefer $$ over \\[\\]', () => {
    const input = '\\[a\\] and $$b$$';
    expect(extractLatex(input)).toBe('b');
  });

  it('should handle multiline formulas in $$', () => {
    const input = `$$
\\begin{aligned}
x &= 1 \\\\
y &= 2
\\end{aligned}
$$`;
    expect(extractLatex(input)).toContain('\\begin{aligned}');
    expect(extractLatex(input)).toContain('x &= 1');
  });

  it('should handle markdown code fences', () => {
    const input = '```latex\n$$x^2$$\n```';
    expect(extractLatex(input)).toBe('x^2');
  });

  it('should remove inline markdown code', () => {
    const input = 'The answer is `$$x^2$$`';
    expect(extractLatex(input)).toBe('x^2');
  });

  it('should return raw content when no delimiters found', () => {
    const input = 'Just plain text formula: x^2';
    expect(extractLatex(input)).toBe('Just plain text formula: x^2');
  });

  it('should handle empty content', () => {
    expect(extractLatex('')).toBe('');
  });

  it('should handle complex formula with fractions', () => {
    const input = '$$\\frac{a}{b}$$';
    expect(extractLatex(input)).toBe('\\frac{a}{b}');
  });

  it('should handle whitespace correctly', () => {
    const input = '$$  x^2 + y^2  $$';
    expect(extractLatex(input)).toBe('x^2 + y^2');
  });
});

describe('buildPayload', () => {
  const dataURL = 'data:image/png;base64,iVBORw0KG...';
  const model = 'PaddleOCR-VL-0.9B';

  it('should build official format payload', () => {
    const payload = buildPayload(dataURL, model, false);
    
    expect(payload.model).toBe(model);
    expect(payload.temperature).toBe(0);
    expect(payload.messages).toHaveLength(1);
    expect(payload.messages[0].role).toBe('user');
    
    const userContent = payload.messages[0].content as any[];
    expect(userContent).toHaveLength(2);
    
    // Image should come first
    expect(userContent[0].type).toBe('image_url');
    expect(userContent[0].image_url.url).toBe(dataURL);
    
    // Text prompt should come second
    expect(userContent[1].type).toBe('text');
    expect(userContent[1].text).toBe('Formula Recognition:');
  });

  it('should use official task prompt', () => {
    const payload = buildPayload(dataURL, model, false);
    const userContent = payload.messages[0].content as any[];
    
    expect(userContent[1].text).toBe('Formula Recognition:');
  });
});

