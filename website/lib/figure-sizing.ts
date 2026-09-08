export type FigureInfo = {
  kind: string;
  width: number;
  height: number;
  displayWidth: number;
  labelSizePx?: number;
};

const vectorMinimumWidths: Record<string, number> = {
  'figures/complex-analysis/note6-fig-01.svg': 300,
  'figures/mcmullens-surgery/ms-fig-35.svg': 300,
  'figures/mcmullens-surgery/ms-fig-31.svg': 280,
  'figures/quadratic-family/qf-fig-02.svg': 340,
  'figures/miscellaneous/m4-fig-01.svg': 300,
  'figures/complex-analysis/note7-fig-03.svg': 330,
  'figures/complex-analysis/note6-fig-03.svg': 360,
  'figures/complex-dynamics-notes/cd1-fig-03.svg': 330,
  'figures/complex-dynamics-notes/cd1-fig-04.svg': 330,
  'figures/complex-dynamics-notes/cd8-fig-03.svg': 340,
  'figures/quadratic-family/qf-fig-05.svg': 360,
  'figures/lemma-book/lb1-fig-19.svg': 220,
};

export function vectorFigureMinimum(src: string): number {
  return vectorMinimumWidths[src] ?? 0;
}

export function articleFigureWidth(info: FigureInfo, vector: boolean, src: string): number {
  if (vector) {
    const nominalLabelSize = info.labelSizePx || 17;
    const consistentLabelWidth = Math.round(info.displayWidth * (20.4 / nominalLabelSize));
    const comfortableLabelCeiling = Math.floor(info.displayWidth * (24 / nominalLabelSize));
    const aspect = info.width / Math.max(1, info.height);
    const drawingMinimum = aspect >= 3.5 ? 620 : aspect >= 2.1 ? 500 : aspect >= 1.2 ? 390 : aspect >= .62 ? 340 : 285;
    return Math.max(vectorFigureMinimum(src), consistentLabelWidth, Math.min(drawingMinimum, comfortableLabelCeiling));
  }
  return Math.min(720, info.width, Math.max(420, Math.round(info.displayWidth * 1.45)));
}
