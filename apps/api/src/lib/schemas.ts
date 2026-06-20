/**
 * Zod schemas for JSON columns read from the database.
 * Provides runtime validation to prevent silent propagation of malformed
 * or schema-drifted JSON values (issues #21 and #43).
 */
import { z, type ZodSchema } from "zod";

// ── Availability ─────────────────────────────────────────────────────────────

export const AvailabilityIntervalSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
});

export const AvailabilitySchema = z.array(AvailabilityIntervalSchema);

// ── Preferences ──────────────────────────────────────────────────────────────

export const PreferenceBlockSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
  rating: z.enum(["preferred", "available", "rather_not"]),
});

export const PreferencesSchema = z.array(PreferenceBlockSchema);

// ── Event Constraints ────────────────────────────────────────────────────────

const dateStringSchema = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date");

const timeStringSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const EventConstraintsSchema = z.object({
  windowType: z
    .enum(["next_n_days", "specific_month", "after_date", "date_range"])
    .optional(),
  windowStart: dateStringSchema.optional(),
  windowEnd: dateStringSchema.optional(),
  nDays: z.number().int().positive().optional(),
  month: z.number().int().min(1).max(12).optional(),
  year: z.number().int().min(1970).max(9999).optional(),
  daysOfWeek: z
    .array(z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]))
    .optional(),
  timeOfDay: z
    .enum(["morning", "afternoon", "evening", "custom"])
    .optional(),
  customStart: timeStringSchema.optional(),
  customEnd: timeStringSchema.optional(),
  excludeDates: z.array(dateStringSchema).optional(),
  timezone: z
    .string()
    .regex(/^[A-Za-z]+\/[A-Za-z_]+$/)
    .optional(),
  asap: z.boolean().optional(),
  // Legacy fields present in older records
  nextDays: z.number().int().positive().optional(),
  afterDate: dateStringSchema.optional(),
  dayPreference: z.enum(["any", "weekdays", "weekends"]).optional(),
  preferredSlots: z
    .array(z.object({ start: z.string(), end: z.string() }))
    .optional(),
  excludedDates: z.array(z.string()).optional(),
});

// ── Votes ────────────────────────────────────────────────────────────────────

export const VotesSchema = z.record(z.enum(["yes", "no", "maybe"]));

// ── Suggestion Breakdown ─────────────────────────────────────────────────────

export const SuggestionBreakdownSchema = z.object({
  free: z.array(z.string()),
  preferred: z.array(z.string()),
  available: z.array(z.string()),
  undesirable: z.array(z.string()),
  unavailable: z.array(z.string()),
  penalties: z.array(
    z.object({
      participantId: z.string(),
      reason: z.string(),
      points: z.number(),
    })
  ),
});

// ── Helper ───────────────────────────────────────────────────────────────────

/**
 * Validates `data` against `schema`. Returns the parsed value on success, or
 * `fallback` on failure (with a console warning so the bad row is surfaced in
 * logs without crashing the request).
 */
export function parseJsonColumn<T>(
  data: unknown,
  schema: ZodSchema<T>,
  fallback: T,
  context?: string
): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  const label = context ? ` [${context}]` : "";
  console.warn(
    `[rally] parseJsonColumn${label}: validation failed — falling back to default.`,
    result.error.issues
  );
  return fallback;
}
