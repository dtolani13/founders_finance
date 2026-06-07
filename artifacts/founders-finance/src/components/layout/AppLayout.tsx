import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Receipt,
  PlusCircle,
  PieChart,
  ArrowRightLeft,
  Wallet,
  Landmark,
  FileText,
  Files,
  CheckSquare,
  Download,
  Settings,
  Banknote,
  ShieldCheck,
} from "lucide-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: Receipt },
  { href: "/expenses/new", label: "New Expense", icon: PlusCircle },
  { href: "/allocations", label: "Allocations", icon: PieChart },
  { href: "/intercompany", label: "Intercompany", icon: ArrowRightLeft },
  { href: "/owner-contributions", label: "Contributions", icon: Wallet },
  { href: "/reimbursements", label: "Reimbursements", icon: Banknote },
  { href: "/tax-reserve", label: "Tax Reserve", icon: Landmark },
  { href: "/evidence", label: "Evidence", icon: Files },
  { href: "/statements", label: "Statements", icon: FileText },
  { href: "/monthly-close", label: "Monthly Close", icon: CheckSquare },
  { href: "/exports", label: "Exports", icon: Download },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground font-sans">
      <aside className="w-[282px] border-r border-border bg-card flex flex-col shadow-[16px_0_40px_rgba(0,0,0,0.22)]">
        <div className="p-5 border-b border-border bg-[linear-gradient(180deg,rgba(0,174,239,0.12),rgba(6,16,30,0))]">
          <div className="flex items-center gap-3">
            <img
              src="/brand/founders-finance-logo-reference.png"
              alt="Founders Finance"
              className="h-14 w-14 rounded-md border border-sky-400/40 object-cover object-left shadow-[0_0_26px_rgba(0,174,239,0.22)]"
            />
            <div className="min-w-0">
              <div className="text-lg font-black uppercase leading-none tracking-normal">
                <span className="text-white">Founders</span>{" "}
                <span className="text-sky-400">Finance</span>
              </div>
              <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">
                Every Dollar. Every Entity.
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-md border border-slate-700/80 bg-slate-950/60 px-3 py-2">
              <p className="text-xs font-bold text-white">Entity</p>
              <p className="text-xs text-slate-400">aware</p>
            </div>
            <div className="rounded-md border border-slate-700/80 bg-slate-950/60 px-3 py-2">
              <p className="text-xs font-bold text-white">Audited</p>
              <p className="text-xs text-slate-400">write trails</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-5 px-3 space-y-1.5">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-semibold transition-colors",
                  isActive
                    ? "bg-sky-500/14 text-white border border-sky-400/70 shadow-[inset_3px_0_0_rgba(56,189,248,1)]"
                    : "text-slate-400 hover:bg-slate-800/70 hover:text-white"
                )}
              >
                <Icon className={cn("w-4 h-4", isActive ? "text-sky-300" : "text-slate-500")} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-background">
        <header className="h-14 border-b border-border bg-card/95 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-2 text-sm text-muted-foreground font-mono">
            {location === "/" ? "/dashboard" : location}
          </div>
          <div className="flex items-center gap-2 rounded-md border border-sky-400/30 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-sky-200">
            <ShieldCheck className="h-3.5 w-3.5" />
            Local control workspace
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
