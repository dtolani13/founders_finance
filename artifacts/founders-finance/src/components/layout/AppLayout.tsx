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
  Banknote
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
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card flex flex-col">
        <div className="p-4 border-b border-border">
          <h1 className="text-sm font-bold tracking-tight uppercase">Founder Ledger</h1>
        </div>
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground font-medium"
                    : "text-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-secondary/30">
        <header className="h-14 border-b border-border bg-card flex items-center px-6 shrink-0">
          <div className="flex items-center gap-2 text-sm text-muted-foreground font-mono">
            {location === "/" ? "/dashboard" : location}
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
