const SECTION_ALIASES = [
  { match: /intro/i, label: 'Intro' },
  { match: /verse|verso|estrofe/i, label: 'Verse' },
  { match: /pre[- ]?chorus|pré[- ]?refr[aã]o|pre[- ]?refrao/i, label: 'Pre-Chorus' },
  { match: /chorus|refr[aã]o|coro/i, label: 'Chorus' },
  { match: /bridge|ponte/i, label: 'Bridge' },
  { match: /tag|ending|outro|final/i, label: 'Outro' },
  { match: /interlude|interl[uú]dio/i, label: 'Interlude' },
  { match: /instrumental/i, label: 'Instrumental' },
];

export const normalizeSectionLabel = (raw) => {
  if (!raw) return 'Section';
  const cleaned = raw.replace(/[\[\]]/g, '').trim();
  const alias = SECTION_ALIASES.find((a) => a.match.test(cleaned));
  if (alias) return alias.label + (cleaned.match(/\d+/) ? ` ${cleaned.match(/\d+/)[0]}` : '');
  return cleaned;
};

export const parseSections = (text) => {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const sections = [];
  let current = { label: 'Intro', lines: [] };

  const flush = () => {
    if (current.lines.length) sections.push({ ...current, text: current.lines.join('\n').trim() });
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    const isHeader = /^\[.+\]$/.test(trimmed);
    if (isHeader) {
      flush();
      current = { label: normalizeSectionLabel(trimmed), lines: [] };
    } else {
      current.lines.push(line);
    }
  });

  flush();
  return sections;
};
