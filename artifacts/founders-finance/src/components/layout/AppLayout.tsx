import { Link, useLocation } from "wouter";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
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
  LogOut,
  DatabaseBackup,
  ArrowDownToLine,
  FileClock,
  Menu,
  ListTree,
} from "lucide-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: Receipt },
  { href: "/expenses/new", label: "New Expense", icon: PlusCircle },
  { href: "/allocations", label: "Allocations", icon: PieChart },
  { href: "/intercompany", label: "Intercompany", icon: ArrowRightLeft },
  { href: "/owner-contributions", label: "Contributions", icon: Wallet },
  { href: "/owner-draws", label: "Owner Draws", icon: ArrowDownToLine },
  { href: "/reimbursements", label: "Reimbursements", icon: Banknote },
  { href: "/tax-reserve", label: "Tax Reserve", icon: Landmark },
  { href: "/evidence", label: "Evidence", icon: Files },
  { href: "/statements", label: "Statements", icon: FileText },
  { href: "/monthly-close", label: "Monthly Close", icon: CheckSquare },
  { href: "/exports", label: "Exports", icon: Download },
  { href: "/backups", label: "Backup & Restore", icon: DatabaseBackup },
  { href: "/audit", label: "Audit Log", icon: FileClock },
  { href: "/reference-data", label: "Reference Data", icon: ListTree },
  { href: "/settings", label: "Settings", icon: Settings },
];

function FoundersFinanceMark() {
  return (
    <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-sky-300/55 bg-[#020817] shadow-[0_0_30px_rgba(0,174,239,0.24)]">
      <svg
        viewBox="0 0 96 96"
        role="img"
        aria-label="Founders Finance emblem"
        className="h-12 w-12"
      >
        <defs>
          <linearGradient id="ff-metal" x1="16" y1="8" x2="78" y2="86" gradientUnits="userSpaceOnUse">
            <stop stopColor="#F8FAFC" />
            <stop offset="0.2" stopColor="#9CA3AF" />
            <stop offset="0.48" stopColor="#334155" />
            <stop offset="0.78" stopColor="#7DD3FC" />
            <stop offset="1" stopColor="#0EA5E9" />
          </linearGradient>
          <linearGradient id="ff-blue" x1="17" y1="71" x2="80" y2="27" gradientUnits="userSpaceOnUse">
            <stop stopColor="#1D4ED8" />
            <stop offset="0.55" stopColor="#00AEEF" />
            <stop offset="1" stopColor="#7DD3FC" />
          </linearGradient>
          <filter id="ff-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <path
          d="M48 8 78 24v24c0 18.5-10.8 31.2-30 40-19.2-8.8-30-21.5-30-40V24L48 8Z"
          fill="#071425"
          stroke="url(#ff-metal)"
          strokeWidth="5"
          strokeLinejoin="round"
        />
        <path
          d="M30 62V45h9v17m7 0V35h9v27m7 0V26h9v36"
          fill="none"
          stroke="#94A3B8"
          strokeWidth="5"
          strokeLinecap="round"
          opacity="0.95"
        />
        <path
          d="m18 70 21-20 13 12 29-36"
          fill="none"
          stroke="url(#ff-blue)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#ff-glow)"
        />
        <path
          d="M69 25h13v13"
          fill="none"
          stroke="#7DD3FC"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#ff-glow)"
        />
      </svg>
    </div>
  );
}

export function AppLayout({
  children,
  lockWorkspace,
}: {
  children: React.ReactNode;
  lockWorkspace: () => Promise<void>;
}) {
  const [location] = useLocation();
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);

  const navigation = (closeAfterNavigation = false) => navItems.map((item) => {
    const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => closeAfterNavigation && setMobileNavigationOpen(false)}
        className={cn(
          "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors",
          isActive
            ? "border border-sky-400/70 bg-sky-500/14 text-white shadow-[inset_3px_0_0_rgba(56,189,248,1)]"
            : "text-slate-400 hover:bg-slate-800/70 hover:text-white",
        )}
      >
        <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-sky-300" : "text-slate-500")} />
        {item.label}
      </Link>
    );
  });

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground font-sans">
      <aside className="hidden w-[286px] shrink-0 flex-col border-r border-border bg-card shadow-[16px_0_40px_rgba(0,0,0,0.22)] md:flex xl:w-[306px]">
        <div className="p-5 border-b border-border bg-[linear-gradient(180deg,rgba(0,174,239,0.12),rgba(6,16,30,0))]">
          <div className="flex items-center gap-4">
            <FoundersFinanceMark />
            <div className="min-w-0">
              <div className="text-2xl font-black leading-[0.9] tracking-normal">
                <span className="block text-white">Founders</span>
                <span className="block text-sky-400">Finance</span>
              </div>
            </div>
          </div>
          <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">
            <span className="block whitespace-nowrap">Where Cash Flows.</span>
            <span className="mt-0.5 block whitespace-nowrap">Where Every Dollar Goes.</span>
          </p>
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
          {navigation()}
        </nav>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-background">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card/95 px-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Sheet open={mobileNavigationOpen} onOpenChange={setMobileNavigationOpen}>
              <SheetTrigger asChild>
                <button type="button" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground md:hidden" aria-label="Open navigation">
                  <Menu className="h-4 w-4" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[286px] border-slate-700 bg-[#07111f] p-0 text-white">
                <SheetTitle className="sr-only">Founders Finance navigation</SheetTitle>
                <div className="border-b border-slate-700 p-4">
                  <div className="flex items-center gap-3"><FoundersFinanceMark /><div className="text-xl font-black leading-none"><span className="block text-white">Founders</span><span className="block text-sky-400">Finance</span></div></div>
                </div>
                <nav className="h-[calc(100vh-97px)] space-y-1 overflow-y-auto p-3">{navigation(true)}</nav>
              </SheetContent>
            </Sheet>
            <div className="truncate font-mono text-xs text-muted-foreground sm:text-sm">
            {location === "/" ? "/dashboard" : location}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-md border border-sky-400/30 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-sky-200 sm:flex">
              <ShieldCheck className="h-3.5 w-3.5" />
              Secure owner session
            </div>
            <button
              type="button"
              onClick={() => void lockWorkspace()}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-700 text-slate-400 transition-colors hover:border-sky-400/60 hover:bg-sky-500/10 hover:text-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              aria-label="Lock Founders Finance"
              title="Lock Founders Finance"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 lg:p-6">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
