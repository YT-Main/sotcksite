import Link from "next/link";

export default function Nav() {
  return (
    <nav className="flex flex-wrap items-center gap-4 border-b border-zinc-800 px-6 py-4">
      <span className="text-lg font-semibold tracking-tight text-white">Stock site</span>
      <div className="flex gap-6 text-sm text-zinc-400">
        <Link className="text-zinc-200 hover:text-white" href="/">
          All stocks
        </Link>
        <Link className="text-zinc-200 hover:text-white" href="/selected">
          Alerts
        </Link>
        <Link className="text-zinc-200 hover:text-white" href="/portfolio">
          Portfolio
        </Link>
        <Link className="text-zinc-200 hover:text-white" href="/scan">
          Scan
        </Link>
      </div>
    </nav>
  );
}
