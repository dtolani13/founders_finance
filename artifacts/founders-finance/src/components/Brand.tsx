export function RclEmblem({ className = "h-12 w-12" }: { className?: string }) {
  return <img src="/brand/rcl-emblem.png" alt="Recursive Chaos Labs emblem" width={48} height={48} className={`shrink-0 object-contain ${className}`} />;
}

export function ProductBrand() {
  return <div className="flex items-center gap-3"><RclEmblem /><div><div className="text-lg font-semibold tracking-tight text-foreground">Founders Finance</div><div className="mt-0.5 text-[11px] text-muted-foreground">by Recursive Chaos Labs</div></div></div>;
}

export function StudioSignature() {
  return <div className="flex items-center gap-3"><RclEmblem /><div><div className="text-sm font-semibold text-foreground">Recursive Chaos Labs</div><div className="mt-1 text-xs rcl-accent">Refining Chaos Into Clarity</div></div></div>;
}
