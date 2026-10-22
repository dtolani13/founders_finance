import { Link, useLocation } from "wouter";
import { useState } from "react";
import { ProductBrand, RclEmblem } from "@/components/Brand";
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
            ? "border rcl-nav-active"
            : "border border-transparent rcl-nav-idle",
        )}
      >
        <Icon className={cn("h-4 w-4 shrink-0", isActive ? "rcl-accent" : "text-muted-foreground")} />
        {item.label}
      </Link>
    );
  });

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground font-sans">
      <aside className="hidden w-[270px] shrink-0 flex-col border-r border-border rcl-sidebar md:flex xl:w-[270px]">
        <div className="border-b border-border px-4 py-6">
          <ProductBrand />
          <p className="mt-4 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Where cash flows.<br />Where every dollar goes.</p>
        </div>
        <nav className="flex-1 overflow-y-auto py-5 px-3 space-y-1">
          {navigation()}
        </nav>
      </aside>

      <main className="min-w-0 flex-1 flex flex-col h-screen overflow-hidden bg-background">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card/95 px-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Sheet open={mobileNavigationOpen} onOpenChange={setMobileNavigationOpen}>
              <SheetTrigger asChild>
                <button type="button" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground md:hidden" aria-label="Open navigation">
                  <Menu className="h-4 w-4" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[270px] border-border rcl-sidebar p-0 text-white">
                <SheetTitle className="sr-only">Founders Finance navigation</SheetTitle>
                <div className="border-b border-border p-4">
                  <ProductBrand />
                </div>
                <nav className="h-[calc(100dvh-81px)] space-y-1 overflow-y-auto p-3">{navigation(true)}</nav>
              </SheetContent>
            </Sheet>
            <div className="flex min-w-0 items-center gap-2 md:hidden"><RclEmblem className="h-7 w-7" /><span className="truncate text-xs font-semibold">Founders Finance</span></div>
            <div className="hidden truncate font-mono text-xs text-muted-foreground md:block sm:text-sm">
            {location === "/" ? "/dashboard" : location}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:flex">
              <ShieldCheck className="h-3.5 w-3.5" />
              Owner workspace
            </div>
            <button
              type="button"
              onClick={() => void lockWorkspace()}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-slate-400 transition-colors hover:border-primary/60 hover:bg-primary/10 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
