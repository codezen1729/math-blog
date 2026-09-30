// These two groups were authored as equal-width minipages. Keep their layout
// shared between the static article and the interactive article renderer.
const galleries = [
  { name: 'julia-examples', images: ['j1.webp', 'j2.webp', 'j3.webp'] },
  { name: 'multibrot-examples', images: ['m1.webp', 'm2.webp', 'm3.webp'] },
];

/** @param {string} html @returns {string} */
export function prepareFigureGalleries(html) {
  return html.replace(/<figure\b([^>]*)>([\s\S]*?)<\/figure>/gi, (original, attributes, body) => {
    const sources = [...body.matchAll(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/gi)]
      .map(match => match[1].replace(/^(?:\/math-blog\/|\/)/, ''));
    const gallery = galleries.find(candidate => candidate.images.length === sources.length
      && candidate.images.every((name, index) => sources[index] === `figures/surgeries/${name}`));
    if (!gallery) return original;

    // Do not discard captions, reference targets, or any other authored content.
    // Only the exporter’s empty paragraph wrappers around single images go away.
    const panelPattern = /<a\b[^>]*>\s*<img\b[^>]*>\s*<\/a>|<img\b[^>]*>/gi;
    const panels = [...body.matchAll(panelPattern)].map(match => match[0]);
    const remainder = body.replace(panelPattern, '').replace(/<\/?p>/gi, '').trim();
    if (panels.length !== 3 || remainder) return original;

    const classMatch = attributes.match(/\bclass="([^"]*)"/i);
    const classes = new Set((classMatch?.[1] ?? '').split(/\s+/).filter(Boolean));
    classes.add('figure-gallery');
    const classAttribute = `class="${[...classes].join(' ')}"`;
    let nextAttributes = classMatch
      ? attributes.replace(classMatch[0], classAttribute)
      : `${attributes} ${classAttribute}`;
    if (!/\bdata-gallery=/.test(nextAttributes)) nextAttributes += ` data-gallery="${gallery.name}"`;

    const normalized = panels.map(panel => panel.replace(/<img\b([^>]*)>/i, (_image, imageAttributes) => {
      const styleMatch = imageAttributes.match(/\sstyle="([^"]*)"/i);
      const styles = (styleMatch?.[1] ?? '').split(';').map(value => value.trim())
        .filter(value => value && !/^(?:width|max-width|height)\s*:/i.test(value));
      styles.push('width:100%', 'max-width:100%', 'height:auto');
      const clean = imageAttributes.replace(/\sstyle="[^"]*"/i, '').replace(/\s*\/$/, '');
      return `<img${clean} style="${styles.join(';')}">`;
    }));
    return `<figure${nextAttributes}>\n${normalized.join('\n')}\n</figure>`;
  });
}
