import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { BookOpen, Edit2, Plus, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { dialogContentBase } from "@/lib/responsive";
import { cn } from "@/lib/utils";
import type { MaintenancePriceBookItem, Organization, User } from "@shared/schema";
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
    form.reset(initialValues || defaultFormValues(defaultCurrency));
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
                    <Select onValueChange={field.onChange} value={field.value}>
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

const SettingsMaintenancePriceBookPanel = () => {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MaintenancePriceBookItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<MaintenancePriceBookItem | null>(null);

  const { data: user } = useQuery<User>({
    queryKey: ["/api/auth/user"],
  });

  const { data: organization } = useQuery<Organization>({
    queryKey: ["/api/organizations", user?.organizationId],
    enabled: !!user?.organizationId,
  });

  const defaultCurrency = useMemo<MaintenancePriceBookCurrency>(() => {
    const preferred = organization?.preferredCurrency;
    if (
      preferred &&
      (MAINTENANCE_PRICE_BOOK_CURRENCIES as readonly string[]).includes(preferred)
    ) {
      return preferred as MaintenancePriceBookCurrency;
    }
    return "GBP";
  }, [organization?.preferredCurrency]);

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
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Price Book</h2>
          <p className="text-muted-foreground">
            Manage reusable quotation line items for maintenance work
          </p>
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
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-6 bg-muted rounded w-1/3" />
                <div className="h-4 bg-muted rounded w-1/2" />
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <BookOpen className="h-10 w-10 text-muted-foreground mb-3" />
            <CardTitle className="text-lg mb-1">No price book lines yet</CardTitle>
            <CardDescription className="mb-4">
              Add labour, materials, and other line templates to reuse on quotes.
            </CardDescription>
            <Button variant="brand" onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add line
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id} data-testid={`card-price-book-item-${item.id}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-base truncate">{item.name}</CardTitle>
                      {item.active ? (
                        <Badge variant="secondary">Active</Badge>
                      ) : (
                        <Badge variant="outline">Inactive</Badge>
                      )}
                    </div>
                    <CardDescription className="flex flex-wrap gap-x-3 gap-y-1">
                      {item.sku ? <span>SKU: {item.sku}</span> : null}
                      <span>
                        {MAINTENANCE_PRICE_BOOK_UNIT_LABELS[
                          item.unit as keyof typeof MAINTENANCE_PRICE_BOOK_UNIT_LABELS
                        ] || item.unit}
                      </span>
                      <span>{formatMoneyMinor(item.defaultUnitPriceMinor, item.currency)}</span>
                      <span>
                        {MAINTENANCE_PRICE_BOOK_VAT_LABELS[
                          item.vatRate as keyof typeof MAINTENANCE_PRICE_BOOK_VAT_LABELS
                        ] || item.vatRate}
                      </span>
                      <span>
                        {MAINTENANCE_PRICE_BOOK_CATEGORY_LABELS[
                          item.category as keyof typeof MAINTENANCE_PRICE_BOOK_CATEGORY_LABELS
                        ] || item.category}
                      </span>
                    </CardDescription>
                    {item.description ? (
                      <p className="text-sm text-muted-foreground line-clamp-2">{item.description}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditingItem(item)}
                      data-testid={`button-edit-price-book-${item.id}`}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeletingItem(item)}
                      data-testid={`button-delete-price-book-${item.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      <LineItemFormDialog
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
