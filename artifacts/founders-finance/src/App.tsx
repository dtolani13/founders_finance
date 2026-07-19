import { Switch, Route, Router as WouterRouter } from "wouter";
import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import { AuthGate } from "@/components/auth/AuthGate";
import { Skeleton } from "@/components/ui/skeleton";

const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Transactions = lazy(() => import("@/pages/Transactions"));
const TransactionDetail = lazy(() => import("@/pages/TransactionDetail"));
const NewExpense = lazy(() => import("@/pages/NewExpense"));
const Allocations = lazy(() => import("@/pages/Allocations"));
const Intercompany = lazy(() => import("@/pages/Intercompany"));
const OwnerContributions = lazy(() => import("@/pages/OwnerContributions"));
const OwnerDraws = lazy(() => import("@/pages/OwnerDraws"));
const Reimbursements = lazy(() => import("@/pages/Reimbursements"));
const TaxReserve = lazy(() => import("@/pages/TaxReserve"));
const Evidence = lazy(() => import("@/pages/Evidence"));
const Statements = lazy(() => import("@/pages/Statements"));
const MonthlyClose = lazy(() => import("@/pages/MonthlyClose"));
const Exports = lazy(() => import("@/pages/Exports"));
const Settings = lazy(() => import("@/pages/Settings"));
const Backups = lazy(() => import("@/pages/Backups"));
const AuditLog = lazy(() => import("@/pages/AuditLog"));
const ReferenceData = lazy(() => import("@/pages/ReferenceData"));
const NotFound = lazy(() => import("@/pages/not-found"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

function Router({ lockWorkspace }: { lockWorkspace: () => Promise<void> }) {
  return (
    <AppLayout lockWorkspace={lockWorkspace}>
      <Suspense fallback={<div className="space-y-4"><Skeleton className="h-8 w-52" /><Skeleton className="h-72 w-full" /></div>}>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/transactions/:id" component={TransactionDetail} />
          <Route path="/transactions" component={Transactions} />
          <Route path="/expenses/new" component={NewExpense} />
          <Route path="/allocations" component={Allocations} />
          <Route path="/intercompany" component={Intercompany} />
          <Route path="/owner-contributions" component={OwnerContributions} />
          <Route path="/owner-draws" component={OwnerDraws} />
          <Route path="/reimbursements" component={Reimbursements} />
          <Route path="/tax-reserve" component={TaxReserve} />
          <Route path="/evidence" component={Evidence} />
          <Route path="/statements" component={Statements} />
          <Route path="/monthly-close" component={MonthlyClose} />
          <Route path="/exports" component={Exports} />
          <Route path="/backups" component={Backups} />
          <Route path="/audit" component={AuditLog} />
          <Route path="/reference-data" component={ReferenceData} />
          <Route path="/settings" component={Settings} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthGate>
          {({ lockWorkspace }) => (
            <WouterRouter
              base={import.meta.env.BASE_URL?.replace(/\/$/, "") || ""}
            >
              <Router
                lockWorkspace={async () => {
                  queryClient.clear();
                  await lockWorkspace();
                }}
              />
            </WouterRouter>
          )}
        </AuthGate>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
