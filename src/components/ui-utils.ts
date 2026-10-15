// Non-component UI helpers (kept out of ui.tsx so it only exports components, for React Fast Refresh).

export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function sortRows<T>(rows: T[], key: keyof T, dir: 'asc' | 'desc'): T[] {
  const factor = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = a[key];
    const vb = b[key];
    if (va === vb) return 0;
    if (va === null || va === undefined) return 1;
    if (vb === null || vb === undefined) return -1;
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * factor;
    return String(va).localeCompare(String(vb), undefined, { numeric: true }) * factor;
  });
}
