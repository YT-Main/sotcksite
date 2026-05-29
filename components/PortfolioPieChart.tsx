type Slice = {
  label: string;
  value: number;
  color: string;
};

type Props = {
  slices: Slice[];
  size?: number;
};

const SLICE_COLORS = [
  "#34d399",
  "#60a5fa",
  "#f472b6",
  "#fbbf24",
  "#a78bfa",
  "#fb7185",
  "#2dd4bf",
  "#818cf8",
  "#f97316",
  "#4ade80",
];

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
}

export default function PortfolioPieChart({ slices, size = 220 }: Props) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) {
    return (
      <div
        className="flex items-center justify-center rounded-full border border-dashed border-zinc-700 text-xs text-zinc-500"
        style={{ width: size, height: size }}
      >
        No value
      </div>
    );
  }

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;
  let cursor = 0;

  const arcs = slices.map((slice, i) => {
    const angle = (slice.value / total) * 360;
    const start = cursor;
    const end = cursor + angle;
    cursor = end;
    const color = slice.color || SLICE_COLORS[i % SLICE_COLORS.length];
    return { ...slice, path: arcPath(cx, cy, r, start, end), color };
  });

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        {arcs.map((arc) => (
          <path key={arc.label} d={arc.path} fill={arc.color} stroke="#18181b" strokeWidth={1.5} />
        ))}
        <circle cx={cx} cy={cy} r={r * 0.45} fill="#18181b" />
      </svg>
      <ul className="space-y-1.5 text-sm">
        {arcs.map((arc) => (
          <li key={arc.label} className="flex items-center gap-2 text-zinc-300">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: arc.color }}
            />
            <span className="font-mono text-zinc-100">{arc.label}</span>
            <span className="text-zinc-500">
              {((arc.value / total) * 100).toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export { SLICE_COLORS };
