import { pgTable, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";

// Estado completo do conteúdo exibido na TV, um registo por tenant (cliente)
export const tenantState = pgTable("tenant_state", {
  tenantId: text("tenant_id").primaryKey(),
  data: jsonb("data").notNull(),
  version: integer("version").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
