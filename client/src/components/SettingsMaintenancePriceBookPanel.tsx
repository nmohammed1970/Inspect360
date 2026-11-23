import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { BookOpen, Edit2, Plus, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { dialogContentBase } from "@/lib/responsive";
import { cn } from "@/lib/utils";
import type { MaintenancePriceBookItem, Organization } from "@shared/schema";
import {
  MAINTENANCE_PRICE_BOOK_CATEGORIES,
  MAINTENANCE_PRICE_BOOK_CATEGORY_LABELS,
  MAINTENANCE_PRICE_BOOK_CURRENCIES,
  MAINTENANCE_PRICE_BOOK_UNIT_LABELS,
  MAINTENANCE_PRICE_BOOK_UNITS,
  MAINTENANCE_PRICE_BOOK_VAT_LABELS,
  MAINTENANCE_PRICE_BOOK_VAT_RATES,
  formatEnvironmentTags,
  maintenancePriceBookItemFormSchema,
  minorToMajor,
  type MaintenancePriceBookCurrency,
  type MaintenancePriceBookItemFormValues,
} from "@shared/maintenancePriceBookConstants";

const PRICE_BOOK_QUERY_KEY = ["/api/maintenance/price-book-items"] as const;

function defaultFormValues(
  currency: MaintenancePriceBookCurrency,
): MaintenancePriceBookItemFormValues {
  return {
    name: "",
    sku: "",
    description: "",
    unit: "hour",
    defaultUnitPrice: 0,
    currency,
    vatRate: "standard_20",
    category: "labour",
    costRate: "",
    environmentTags: "",
    productivityRate: "",
    active: true,
  };
}

function itemToFormValues(item: MaintenancePriceBookItem): MaintenancePriceBookItemFormValues {
  return {
    name: item.name,
    sku: item.sku || "",
    description: item.description || "",
    unit: item.unit as MaintenancePriceBookItemFormValues["unit"],
    defaultUnitPrice: minorToMajor(item.defaultUnitPriceMinor),
    currency: item.currency as MaintenancePriceBookCurrency,
    vatRate: item.vatRate as MaintenancePriceBookItemFormValues["vatRate"],
    category: item.category as MaintenancePriceBookItemFormValues["category"],
    costRate: item.costRateMinor == null ? "" : minorToMajor(item.costRateMinor),
    environmentTags: formatEnvironmentTags(item.environmentTags || []),
    productivityRate:
      item.productivityRate == null || item.productivityRate === ""
        ? ""
        : Number(item.productivityRate),
    active: item.active,
  };
}

function formToApiPayload(values: MaintenancePriceBookItemFormValues) {
  const costRate =
    values.costRate === "" || values.costRate == null || Number.isNaN(values.costRate as number)
      ? null
      : Number(values.costRate);
  const productivityRate =
    values.productivityRate === "" ||
    values.productivityRate == null ||
    Number.isNaN(values.productivityRate as number)
      ? null
      : Number(values.productivityRate);

  return {
    name: values.name,
    sku: values.sku?.trim() ? values.sku.trim() : null,
    description: values.description?.trim() ? values.description.trim() : null,
    unit: values.unit,
    defaultUnitPrice: values.defaultUnitPrice,
    currency: values.currency,
    vatRate: values.vatRate,
    category: values.category,
    costRate,
    environmentTags: values.environmentTags || "",
    productivityRate,
    active: values.active,
  };
}

function formatMoneyMinor(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

interface LineItemFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  defaultCurrency: MaintenancePriceBookCurrency;
  initialValues?: MaintenancePriceBookItemFormValues;
  submitting: boolean;
  onSubmit: (values: MaintenancePriceBookItemFormValues) => void;
}

const LineItemFormDialog = ({
  open,
  onOpenChange,
  title,
  defaultCurrency,
  initialValues,
  submitting,
  onSubmit,
}: LineItemFormDialogProps) => {
  const form = useForm<MaintenancePriceBookItemFormValues>({
    resolver: zodResolver(maintenancePriceBookItemFormSchema),
    defaultValues: initialValues || defaultFormValues(defaultCurrency),
  });

  const category = form.watch("category");

  useEffect(() => {
    if (!open) return;
    if (initialValues) {
      form.reset(initialValues);
      return;
    }
    form.reset(defaultFormValues(defaultCurrency));
    form.setValue("currency", defaultCurrency);
  }, [open, initialValues, defaultCurrency, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(dialogContentBase, "max-w-lg max-h-[90vh] overflow-y-auto")}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g. Labour — electrician" data-testid="input-price-book-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="sku"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>SKU</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Optional unique code" data-testid="input-price-book-sku" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={2}
                      placeholder="Optional details shown on quotes"
                      data-testid="input-price-book-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-price-book-unit">
                          <SelectValue placeholder="Unit" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {MAINTENANCE_PRICE_BOOK_UNITS.map((unit) => (
                          <SelectItem key={unit} value={unit}>
                            {MAINTENANCE_PRICE_BOOK_UNIT_LABELS[unit]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="defaultUnitPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default unit price</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value === "" ? 0 : e.target.value)}
                        data-testid="input-price-book-unit-price"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Currency</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value || defaultCurrency}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-price-book-currency">
                          <SelectValue placeholder="Currency" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {MAINTENANCE_PRICE_BOOK_CURRENCIES.map((currency) => (
                          <SelectItem key={currency} value={currency}>
                            {currency}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="vatRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>VAT</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-price-book-vat">
                          <SelectValue placeholder="VAT" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {MAINTENANCE_PRICE_BOOK_VAT_RATES.map((vat) => (
                          <SelectItem key={vat} value={vat}>
                            {MAINTENANCE_PRICE_BOOK_VAT_LABELS[vat]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-price-book-category">
                          <SelectValue placeholder="Category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {MAINTENANCE_PRICE_BOOK_CATEGORIES.map((categoryOption) => (
                          <SelectItem key={categoryOption} value={categoryOption}>
                            {MAINTENANCE_PRICE_BOOK_CATEGORY_LABELS[categoryOption]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="costRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cost rate</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={field.value === "" || field.value == null ? "" : String(field.value)}
                        onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                        placeholder="Optional"
                        data-testid="input-price-book-cost-rate"
                      />
                    </FormControl>
                    <FormDescription>Internal cost (major units)</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="environmentTags"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Environment tags</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="e.g. office, medical"
                      data-testid="input-price-book-environment-tags"
                    />
                  </FormControl>
                  <FormDescription>Comma-separated</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {category === "labour" && (
              <FormField
                control={form.control}
                name="productivityRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Productivity rate</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={
                          field.value === "" || field.value == null ? "" : String(field.value)
                        }
                        onChange={(e) =>
                          field.onChange(e.target.value === "" ? "" : e.target.value)
                        }
                        placeholder="Optional"
                        data-testid="input-price-book-productivity-rate"
                      />
                    </FormControl>
                    <FormDescription>m²/hour</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-3">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                      data-testid="checkbox-price-book-active"
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Active in price book</FormLabel>
                    <FormDescription>Inactive lines stay saved but are hidden from catalogs later</FormDescription>
                  </div>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" variant="brand" disabled={submitting} data-testid="button-save-price-book-line">
                {submitting ? "Saving..." : "Save line"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

interface SettingsMaintenancePriceBookPanelProps {
  /** When true, omit the large standalone page heading (finance hub tab). */
  embedded?: boolean;
}

const SettingsMaintenancePriceBookPanel = ({
  embedded = false,
}: SettingsMaintenancePriceBookPanelProps) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MaintenancePriceBookItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<MaintenancePriceBookItem | null>(null);

  const organizationId = user?.organizationId;

  const { data: organization, isSuccess: orgLoaded } = useQuery<Organization>({
    queryKey: ["/api/organizations", organizationId],
    enabled: !!organizationId,
  });

  const defaultCurrency = useMemo<MaintenancePriceBookCurrency>(() => {
    // Prefer org currency once loaded; GBP while pending or if preferred is missing/unsupported.
    if (orgLoaded) {
      const preferred = organization?.preferredCurrency;
      if (
        preferred &&
        (MAINTENANCE_PRICE_BOOK_CURRENCIES as readonly string[]).includes(preferred)
      ) {
        return preferred as MaintenancePriceBookCurrency;
      }
    }
    return "GBP";
  }, [organization?.preferredCurrency, orgLoaded]);

  const { data: items = [], isLoading } = useQuery<MaintenancePriceBookItem[]>({
    queryKey: PRICE_BOOK_QUERY_KEY,
  });

  const createMutation = useMutation({
    mutationFn: async (values: MaintenancePriceBookItemFormValues) => {
      return apiRequest("POST", "/api/maintenance/price-book-items", formToApiPayload(values));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRICE_BOOK_QUERY_KEY });
      toast({ title: "Line added", description: "Price book line created successfully." });
      setIsCreateOpen(false);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Could not create line",
        description: error.message || "Failed to create price book line",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string;
      values: MaintenancePriceBookItemFormValues;
    }) => {
      return apiRequest(
        "PATCH",
        `/api/maintenance/price-book-items/${id}`,
        formToApiPayload(values),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRICE_BOOK_QUERY_KEY });
      toast({ title: "Line updated", description: "Price book line saved successfully." });
      setEditingItem(null);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Could not update line",
        description: error.message || "Failed to update price book line",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/maintenance/price-book-items/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRICE_BOOK_QUERY_KEY });
      toast({ title: "Line deleted", description: "Price book line removed." });
      setDeletingItem(null);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Could not delete line",
        description: error.message || "Failed to delete price book line",
      });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          {embedded ? (
            <>
              <h2 className="text-sm font-semibold tracking-tight">Price book</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Reusable labour, materials, and other line templates for quotations
              </p>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold tracking-tight">Price Book</h2>
              <p className="text-muted-foreground">
                Manage reusable quotation line items for maintenance work
              </p>
            </>
          )}
        </div>
        <Button
          variant="brand"
          onClick={() => setIsCreateOpen(true)}
          data-testid="button-add-price-book-line"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add line
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full rounded-md" />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="min-w-[180px]">Name</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
                <TableHead>VAT</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-28 text-center">
                    <div className="flex flex-col items-center justify-center gap-2 py-4">
                      <BookOpen className="h-8 w-8 text-muted-foreground" />
                      <p className="text-sm font-medium">No price book lines yet</p>
                      <p className="text-xs text-muted-foreground max-w-sm">
                        Add labour, materials, and other line templates to reuse on quotes.
                      </p>
                      <Button
                        variant="brand"
                        size="sm"
                        className="mt-1"
                        onClick={() => setIsCreateOpen(true)}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add line
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow
                    key={item.id}
                    className="hover:bg-muted/40"
                    data-testid={`row-price-book-item-${item.id}`}
                  >
                    <TableCell>
                      <div className="min-w-0 space-y-0.5">
                        <p className="font-medium truncate">{item.name}</p>
                        {item.description ? (
                          <p className="text-xs text-muted-foreground line-clamp-1 max-w-md">
                            {item.description}
                          </p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {item.sku || "—"}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {MAINTENANCE_PRICE_BOOK_CATEGORY_LABELS[
                        item.category as keyof typeof MAINTENANCE_PRICE_BOOK_CATEGORY_LABELS
                      ] || item.category}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {MAINTENANCE_PRICE_BOOK_UNIT_LABELS[
                        item.unit as keyof typeof MAINTENANCE_PRICE_BOOK_UNIT_LABELS
                      ] || item.unit}
                    </TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap text-sm">
                      {formatMoneyMinor(item.defaultUnitPriceMinor, item.currency)}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {MAINTENANCE_PRICE_BOOK_VAT_LABELS[
                        item.vatRate as keyof typeof MAINTENANCE_PRICE_BOOK_VAT_LABELS
                      ] || item.vatRate}
                    </TableCell>
                    <TableCell>
                      {item.active ? (
                        <Badge variant="secondary">Active</Badge>
                      ) : (
                        <Badge variant="outline">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setEditingItem(item)}
                          data-testid={`button-edit-price-book-${item.id}`}
                          title="Edit"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setDeletingItem(item)}
                          data-testid={`button-delete-price-book-${item.id}`}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <LineItemFormDialog
        key={`new-line-${defaultCurrency}`}
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        title="New line"
        defaultCurrency={defaultCurrency}
        submitting={createMutation.isPending}
        onSubmit={(values) => createMutation.mutate(values)}
      />

      <LineItemFormDialog
        open={!!editingItem}
        onOpenChange={(open) => {
          if (!open) setEditingItem(null);
        }}
        title="Edit line"
        defaultCurrency={defaultCurrency}
        initialValues={editingItem ? itemToFormValues(editingItem) : undefined}
        submitting={updateMutation.isPending}
        onSubmit={(values) => {
          if (!editingItem) return;
          updateMutation.mutate({ id: editingItem.id, values });
        }}
      />

      <DeleteConfirmDialog
        open={!!deletingItem}
        onOpenChange={(open) => {
          if (!open) setDeletingItem(null);
        }}
        title="Delete price book line?"
        description="This cannot be undone. You are about to delete"
        itemName={deletingItem?.name}
        onConfirm={() => {
          if (deletingItem) deleteMutation.mutate(deletingItem.id);
        }}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
};

export default SettingsMaintenancePriceBookPanel;
