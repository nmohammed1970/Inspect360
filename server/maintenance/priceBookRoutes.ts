import type { Express } from "express";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { isAuthenticated, requireCompanyModule, requireRole } from "../auth";
import { db } from "../db";
import { maintenancePriceBookItems } from "@shared/schema";
import {
  MAINTENANCE_PRICE_BOOK_CURRENCIES,
  maintenancePriceBookItemCreateSchema,
  maintenancePriceBookItemUpdateSchema,
  type MaintenancePriceBookCurrency,
} from "@shared/maintenancePriceBookConstants";

function orgId(req: any): string {
  return req.user.organizationId as string;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

function serializeItem(row: typeof maintenancePriceBookItems.$inferSelect) {
  return {
    ...row,
    productivityRate:
      row.productivityRate == null ? null : Number(row.productivityRate),
  };
}

export function registerMaintenancePriceBookRoutes(app: Express) {
  const writeGuards = [
    isAuthenticated,
    requireCompanyModule("maintenance"),
    requireRole("owner", "clerk"),
  ] as const;

  /** Read/search: any non-tenant with maintenance (quote autocomplete). */
  const readGuards = [
    isAuthenticated,
    requireCompanyModule("maintenance"),
    (req: any, res: any, next: any) => {
      if (req.user?.role === "tenant") {
        return res.status(403).json({ message: "Forbidden" });
      }
      next();
    },
  ] as const;

  app.get("/api/maintenance/price-book-items", ...readGuards, async (req: any, res) => {
    try {
      const organizationId = orgId(req);
      const conditions = [eq(maintenancePriceBookItems.organizationId, organizationId)];

      const currency = typeof req.query.currency === "string" ? req.query.currency : null;
      if (
        currency &&
        (MAINTENANCE_PRICE_BOOK_CURRENCIES as readonly string[]).includes(currency)
      ) {
        conditions.push(
          eq(
            maintenancePriceBookItems.currency,
            currency as MaintenancePriceBookCurrency,
          ),
        );
      }

      if (typeof req.query.active === "string") {
        if (req.query.active === "true") {
          conditions.push(eq(maintenancePriceBookItems.active, true));
        } else if (req.query.active === "false") {
          conditions.push(eq(maintenancePriceBookItems.active, false));
        }
      }

      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
      if (q.length > 0) {
        const pattern = `%${q}%`;
        conditions.push(
          or(
            ilike(maintenancePriceBookItems.name, pattern),
            ilike(maintenancePriceBookItems.sku, pattern),
          )!,
        );
      }

      const rows = await db
        .select()
        .from(maintenancePriceBookItems)
        .where(and(...conditions))
        .orderBy(desc(maintenancePriceBookItems.updatedAt), desc(maintenancePriceBookItems.createdAt));

      res.json(rows.map(serializeItem));
    } catch (error) {
      console.error("[price-book] list failed:", error);
      res.status(500).json({ message: "Failed to load price book items" });
    }
  });

  app.post("/api/maintenance/price-book-items", ...writeGuards, async (req: any, res) => {
    try {
      const organizationId = orgId(req);
      const parsed = maintenancePriceBookItemCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          message: "Invalid price book item",
          errors: parsed.error.flatten(),
        });
      }

      const data = parsed.data;
      const [row] = await db
        .insert(maintenancePriceBookItems)
        .values({
          organizationId,
          name: data.name,
          sku: data.sku,
          description: data.description,
          unit: data.unit,
          defaultUnitPriceMinor: data.defaultUnitPrice,
          currency: data.currency,
          vatRate: data.vatRate,
          category: data.category,
          costRateMinor: data.costRate,
          environmentTags: data.environmentTags,
          productivityRate:
            data.productivityRate == null ? null : String(data.productivityRate),
          active: data.active,
        })
        .returning();

      res.status(201).json(serializeItem(row));
    } catch (error) {
      if (isUniqueViolation(error)) {
        return res.status(409).json({ message: "SKU already exists for this organisation" });
      }
      console.error("[price-book] create failed:", error);
      res.status(500).json({ message: "Failed to create price book item" });
    }
  });

  app.patch("/api/maintenance/price-book-items/:id", ...writeGuards, async (req: any, res) => {
    try {
      const organizationId = orgId(req);
      const id = String(req.params.id || "");
      if (!id) {
        return res.status(400).json({ message: "Item id is required" });
      }

      const parsed = maintenancePriceBookItemUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          message: "Invalid price book item",
          errors: parsed.error.flatten(),
        });
      }

      const data = parsed.data;
      if (Object.keys(data).length === 0) {
        return res.status(400).json({ message: "No fields to update" });
      }

      const patch: Partial<typeof maintenancePriceBookItems.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (data.name !== undefined) patch.name = data.name;
      if (data.sku !== undefined) patch.sku = data.sku;
      if (data.description !== undefined) patch.description = data.description;
      if (data.unit !== undefined) patch.unit = data.unit;
      if (data.defaultUnitPrice !== undefined) {
        patch.defaultUnitPriceMinor = data.defaultUnitPrice;
      }
      if (data.currency !== undefined) patch.currency = data.currency;
      if (data.vatRate !== undefined) patch.vatRate = data.vatRate;
      if (data.category !== undefined) patch.category = data.category;
      if (data.costRate !== undefined) patch.costRateMinor = data.costRate;
      if (data.environmentTags !== undefined) {
        patch.environmentTags = data.environmentTags;
      }
      if (data.productivityRate !== undefined) {
        patch.productivityRate =
          data.productivityRate == null ? null : String(data.productivityRate);
      }
      if (data.active !== undefined) patch.active = data.active;

      const [row] = await db
        .update(maintenancePriceBookItems)
        .set(patch)
        .where(
          and(
            eq(maintenancePriceBookItems.id, id),
            eq(maintenancePriceBookItems.organizationId, organizationId),
          ),
        )
        .returning();

      if (!row) {
        return res.status(404).json({ message: "Price book item not found" });
      }

      res.json(serializeItem(row));
    } catch (error) {
      if (isUniqueViolation(error)) {
        return res.status(409).json({ message: "SKU already exists for this organisation" });
      }
      console.error("[price-book] update failed:", error);
      res.status(500).json({ message: "Failed to update price book item" });
    }
  });

  app.delete("/api/maintenance/price-book-items/:id", ...writeGuards, async (req: any, res) => {
    try {
      const organizationId = orgId(req);
      const id = String(req.params.id || "");
      if (!id) {
        return res.status(400).json({ message: "Item id is required" });
      }

      const [row] = await db
        .delete(maintenancePriceBookItems)
        .where(
          and(
            eq(maintenancePriceBookItems.id, id),
            eq(maintenancePriceBookItems.organizationId, organizationId),
          ),
        )
        .returning({ id: maintenancePriceBookItems.id });

      if (!row) {
        return res.status(404).json({ message: "Price book item not found" });
      }

      res.json({ ok: true, id: row.id });
    } catch (error) {
      console.error("[price-book] delete failed:", error);
      res.status(500).json({ message: "Failed to delete price book item" });
    }
  });
}
