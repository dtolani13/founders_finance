import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListAccountsQueryKey,
  getListAllocationPresetsQueryKey,
  getListCategoriesQueryKey,
  getListVendorsQueryKey,
  useCreateAccount,
  useCreateAllocationPreset,
  useCreateCategory,
  useCreateVendor,
  useListAccounts,
  useListAllocationPresets,
  useListCategories,
  useListEntities,
  useListVendors,
  useUpdateAccount,
  useUpdateAllocationPreset,
  useUpdateCategory,
  useUpdateVendor,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Pencil, Plus, Power } from "lucide-react";

type EditTarget = { kind: "account" | "category" | "vendor" | "preset"; id: string; name: string };

export default function ReferenceData() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const listParams = { include_inactive: true };
  const { data: accounts } = useListAccounts(listParams);
  const { data: categories } = useListCategories(listParams);
  const { data: vendors } = useListVendors(listParams);
  const { data: presets } = useListAllocationPresets(listParams);
  const { data: entities } = useListEntities();
  const activeCompanies = entities?.filter((entity) => entity.lifecycle_status === "active" && entity.short_code !== "PERSONAL") ?? [];

  const [account, setAccount] = useState({ entity_id: "", name: "", account_type: "checking", institution_name: "", last_four: "", opening_balance: "0" });
  const [category, setCategory] = useState({ name: "", category_type: "expense" });
  const [vendorName, setVendorName] = useState("");
  const [presetName, setPresetName] = useState("");
  const [percentages, setPercentages] = useState<Record<string, string>>({});
  const [edit, setEdit] = useState<EditTarget | null>(null);

  const refresh = (kind: EditTarget["kind"]) => {
    const key = kind === "account" ? getListAccountsQueryKey(listParams)
      : kind === "category" ? getListCategoriesQueryKey(listParams)
      : kind === "vendor" ? getListVendorsQueryKey(listParams)
      : getListAllocationPresetsQueryKey(listParams);
    queryClient.invalidateQueries({ queryKey: key });
  };
  const success = (kind: EditTarget["kind"], message: string) => { refresh(kind); toast({ title: message }); };
  const failure = (message: string) => toast({ title: message, variant: "destructive" });

  const createAccount = useCreateAccount({ mutation: { onSuccess: () => { success("account", "Account added"); setAccount({ entity_id: "", name: "", account_type: "checking", institution_name: "", last_four: "", opening_balance: "0" }); }, onError: () => failure("Account could not be added") } });
  const createCategory = useCreateCategory({ mutation: { onSuccess: () => { success("category", "Category added"); setCategory({ name: "", category_type: "expense" }); }, onError: () => failure("Category could not be added") } });
  const createVendor = useCreateVendor({ mutation: { onSuccess: () => { success("vendor", "Vendor added"); setVendorName(""); }, onError: () => failure("Vendor could not be added") } });
  const createPreset = useCreateAllocationPreset({ mutation: { onSuccess: () => { success("preset", "Allocation preset added"); setPresetName(""); setPercentages({}); }, onError: () => failure("Preset must use active companies and total 100%") } });
  const updateAccount = useUpdateAccount({ mutation: { onSuccess: () => success("account", "Account updated"), onError: () => failure("Account could not be updated") } });
  const updateCategory = useUpdateCategory({ mutation: { onSuccess: () => success("category", "Category updated"), onError: () => failure("Category could not be updated") } });
  const updateVendor = useUpdateVendor({ mutation: { onSuccess: () => success("vendor", "Vendor updated"), onError: () => failure("Vendor could not be updated") } });
  const updatePreset = useUpdateAllocationPreset({ mutation: { onSuccess: () => success("preset", "Preset updated"), onError: () => failure("Preset could not be updated") } });

  function update(kind: EditTarget["kind"], id: string, data: { name?: string; is_active?: boolean }) {
    if (kind === "account") updateAccount.mutate({ id, data });
    if (kind === "category") updateCategory.mutate({ id, data });
    if (kind === "vendor") updateVendor.mutate({ id, data });
    if (kind === "preset") updatePreset.mutate({ id, data });
  }

  const row = (kind: EditTarget["kind"], record: { id: string; name: string; is_active: boolean }, detail: string) => (
    <div key={record.id} className="flex items-center gap-3 border-b px-3 py-2.5 last:border-0">
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{record.name}</p><p className="truncate text-xs text-muted-foreground">{detail}</p></div>
      <Badge variant={record.is_active ? "default" : "outline"}>{record.is_active ? "Active" : "Inactive"}</Badge>
      <Button size="icon" variant="ghost" title="Edit name" onClick={() => setEdit({ kind, id: record.id, name: record.name })}><Pencil className="h-3.5 w-3.5" /></Button>
      <Button size="icon" variant="ghost" title={record.is_active ? "Deactivate" : "Reactivate"} onClick={() => update(kind, record.id, { is_active: !record.is_active })}><Power className="h-3.5 w-3.5" /></Button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Reference Data</h1><p className="mt-1 text-sm text-muted-foreground">Accounts, categories, vendors, and allocation presets used by financial workflows</p></div>
      <Tabs defaultValue="accounts">
        <TabsList className="grid h-auto w-full grid-cols-2 md:grid-cols-4"><TabsTrigger value="accounts">Accounts</TabsTrigger><TabsTrigger value="categories">Categories</TabsTrigger><TabsTrigger value="vendors">Vendors</TabsTrigger><TabsTrigger value="presets">Presets</TabsTrigger></TabsList>

        <TabsContent value="accounts" className="space-y-4">
          <Card><CardHeader><CardTitle className="text-base">Add Account</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-3">
            <Select value={account.entity_id} onValueChange={(value) => setAccount({ ...account, entity_id: value })}><SelectTrigger><SelectValue placeholder="Company" /></SelectTrigger><SelectContent>{activeCompanies.map((entity) => <SelectItem key={entity.id} value={entity.id}>{entity.display_name}</SelectItem>)}</SelectContent></Select>
            <Input value={account.name} onChange={(event) => setAccount({ ...account, name: event.target.value })} placeholder="Account name" />
            <Select value={account.account_type} onValueChange={(value) => setAccount({ ...account, account_type: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["checking", "savings", "credit_card", "cash", "loan", "other"].map((type) => <SelectItem key={type} value={type}>{type.replaceAll("_", " ")}</SelectItem>)}</SelectContent></Select>
            <Input value={account.institution_name} onChange={(event) => setAccount({ ...account, institution_name: event.target.value })} placeholder="Institution (optional)" />
            <Input value={account.last_four} onChange={(event) => setAccount({ ...account, last_four: event.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder="Last four (optional)" />
            <div className="flex gap-2"><Input type="number" step="0.01" value={account.opening_balance} onChange={(event) => setAccount({ ...account, opening_balance: event.target.value })} placeholder="Opening balance" /><Button disabled={!account.entity_id || !account.name} onClick={() => createAccount.mutate({ data: { entity_id: account.entity_id, name: account.name, account_type: account.account_type as "checking", institution_name: account.institution_name || null, last_four: account.last_four || null, opening_balance: Number(account.opening_balance) } })}><Plus className="h-4 w-4" />Add</Button></div>
          </CardContent></Card>
          <Card><CardContent className="p-0">{accounts?.map((record) => row("account", record, `${entities?.find((entity) => entity.id === record.entity_id)?.display_name ?? "Company"} - ${record.account_type.replaceAll("_", " ")}${record.last_four ? ` - ${record.last_four}` : ""}`))}</CardContent></Card>
        </TabsContent>

        <TabsContent value="categories" className="space-y-4">
          <Card><CardContent className="grid gap-3 pt-5 md:grid-cols-[1fr_1fr_auto]"><Input value={category.name} onChange={(event) => setCategory({ ...category, name: event.target.value })} placeholder="Category name" /><Select value={category.category_type} onValueChange={(value) => setCategory({ ...category, category_type: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["expense", "income", "asset", "liability", "equity", "other"].map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select><Button disabled={!category.name} onClick={() => createCategory.mutate({ data: { name: category.name, category_type: category.category_type as "expense" } })}><Plus className="h-4 w-4" />Add</Button></CardContent></Card>
          <Card><CardContent className="p-0">{categories?.map((record) => row("category", record, record.category_type))}</CardContent></Card>
        </TabsContent>

        <TabsContent value="vendors" className="space-y-4">
          <Card><CardContent className="flex gap-3 pt-5"><Input value={vendorName} onChange={(event) => setVendorName(event.target.value)} placeholder="Vendor name" /><Button disabled={!vendorName} onClick={() => createVendor.mutate({ data: { name: vendorName } })}><Plus className="h-4 w-4" />Add</Button></CardContent></Card>
          <Card><CardContent className="p-0">{vendors?.map((record) => row("vendor", record, record.notes ?? "Vendor"))}</CardContent></Card>
        </TabsContent>

        <TabsContent value="presets" className="space-y-4">
          <Card><CardHeader><CardTitle className="text-base">Add Allocation Preset</CardTitle></CardHeader><CardContent className="space-y-3"><Input value={presetName} onChange={(event) => setPresetName(event.target.value)} placeholder="Preset name" /><div className="grid gap-2 md:grid-cols-2">{activeCompanies.map((entity) => <label key={entity.id} className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"><span className="flex-1">{entity.display_name}</span><Input className="w-24" type="number" min="0" max="100" step="0.01" value={percentages[entity.id] ?? ""} onChange={(event) => setPercentages({ ...percentages, [entity.id]: event.target.value })} placeholder="0%" /></label>)}</div><div className="flex items-center justify-between"><p className="text-xs text-muted-foreground">Total: {Object.values(percentages).reduce((sum, value) => sum + Number(value || 0), 0)}%</p><Button disabled={!presetName || Math.abs(Object.values(percentages).reduce((sum, value) => sum + Number(value || 0), 0) - 100) > 0.001} onClick={() => createPreset.mutate({ data: { name: presetName, lines: Object.entries(percentages).filter(([, value]) => Number(value) > 0).map(([entity_id, percent]) => ({ entity_id, percent: Number(percent) })) } })}><Plus className="h-4 w-4" />Add Preset</Button></div></CardContent></Card>
          <Card><CardContent className="p-0">{presets?.map((record) => row("preset", record, record.lines.map((line) => `${line.entity_short_code}: ${line.percent}%`).join(" - ")))}</CardContent></Card>
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(edit)} onOpenChange={(open) => !open && setEdit(null)}><DialogContent><DialogHeader><DialogTitle>Edit name</DialogTitle></DialogHeader><Input value={edit?.name ?? ""} onChange={(event) => edit && setEdit({ ...edit, name: event.target.value })} /><DialogFooter><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button disabled={!edit?.name.trim()} onClick={() => { if (!edit) return; update(edit.kind, edit.id, { name: edit.name.trim() }); setEdit(null); }}>Save</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}
