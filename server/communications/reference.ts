import { sql } from "drizzle-orm";
import { db } from "../db";

/** Allocate next COM-YYYY-##### reference for an organisation (transaction-safe). */
export async function allocateCommunicationReference(
  organizationId: string,
): Promise<string> {
  return db.transaction(async (tx) => {
    const year = new Date().getFullYear();
    const existing = await tx.execute(sql`
      SELECT id, next_value
      FROM communication_document_sequences
      WHERE organization_id = ${organizationId}
        AND year = ${year}
      FOR UPDATE
    `);

    let nextValue: number;
    if (!existing.rows || existing.rows.length === 0) {
      nextValue = 1;
      await tx.execute(sql`
        INSERT INTO communication_document_sequences
          (id, organization_id, year, next_value, updated_at)
        VALUES
          (gen_random_uuid()::text, ${organizationId}, ${year}, 2, NOW())
      `);
    } else {
      const row = existing.rows[0] as { id: string; next_value: number };
      nextValue = Number(row.next_value) || 1;
      await tx.execute(sql`
        UPDATE communication_document_sequences
        SET next_value = ${nextValue + 1}, updated_at = NOW()
        WHERE id = ${row.id}
      `);
    }

    const padded = String(nextValue).padStart(5, "0");
    return `COM-${year}-${padded}`;
  });
}
