import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import { AuthGate } from "@/components/auth/AuthGate";
import Dashboard from "@/pages/Dashboard";
import Transactions from "@/pages/Transactions";
import NewExpense from "@/pages/NewExpense";
import Allocations from "@/pages/Allocations";
import Intercompany from "@/pages/Intercompany";
import OwnerContributions from "@/pages/OwnerContributions";
import Reimbursements from "@/pages/Reimbursements";
import TaxReserve from "@/pages/TaxReserve";
import Evidence from "@/pages/Evidence";
import Statements from "@/pages/Statements";
import MonthlyClose from "@/pages/MonthlyClose";
import Exports from "@/pages/Exports";
import Settings from "@/pages/Settings";
import Backups from "@/pages/Backups";
import NotFound from "@/pages/not-found";

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
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/transactions" component={Transactions} />
        <Route path="/expenses/new" component={NewExpense} />
        <Route path="/allocations" component={Allocations} />
        <Route path="/intercompany" component={Intercompany} />
        <Route path="/owner-contributions" component={OwnerContributions} />
        <Route path="/reimbursements" component={Reimbursements} />
        <Route path="/tax-reserve" component={TaxReserve} />
        <Route path="/evidence" component={Evidence} />
        <Route path="/statements" component={Statements} />
        <Route path="/monthly-close" component={MonthlyClose} />
        <Route path="/exports" component={Exports} />
        <Route path="/backups" component={Backups} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
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
