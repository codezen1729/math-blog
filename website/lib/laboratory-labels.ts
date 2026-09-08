import katex from 'katex';

// Static, trusted formulas: KaTeX supplies both typography and accessible MathML.
export const quadraticFormulaHtml = katex.renderToString(String.raw`z \mapsto z^{2} + c`, { throwOnError: true, output: 'htmlAndMathml' });
export const multiplierFormulaHtml = katex.renderToString(String.raw`\mu \in \mathbb{D}`, { throwOnError: true, output: 'htmlAndMathml' });
export const rabbitMultiplierHtml = katex.renderToString(String.raw`e^{2\pi i/3}`, { throwOnError: true, output: 'htmlAndMathml' });
export const misiurewiczItineraryHtml = katex.renderToString(String.raw`0 \longmapsto i \longmapsto -1+i \longmapsto -i \longmapsto -1+i \longmapsto \cdots`, { throwOnError: true, output: 'htmlAndMathml' });
export const feigenbaumParameterHtml = katex.renderToString(String.raw`c_{\infty} \approx -1.4011551890920506`, { throwOnError: true, output: 'htmlAndMathml' });

export function indexedZHtml(index: number | 'n'): string {
  if (index !== 'n' && (!Number.isSafeInteger(index) || index < 0)) {
    throw new RangeError('An orbit index must be a non-negative integer or n.');
  }
  return katex.renderToString(`z_{${index}}`, { throwOnError: true, output: 'htmlAndMathml' });
}
