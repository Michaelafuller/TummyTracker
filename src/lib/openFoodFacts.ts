// Pure mapping of an Open Food Facts API response to our nutrition shape
// (BUILD_PLAN.md §1c). No network here — `features/barcode/api.ts` does the fetch
// and hands the parsed JSON to `mapOffResponse`. Keeping this pure makes it
// fixture-testable.

import type { ComponentFormState } from '@/features/logging/componentFormModel';
import type { LogEntryFormState, NutritionInputs } from '@/features/logging/formModel';
import { extractTags, serializeTags } from '@/lib/ingredients';
import { scaleNutrition, type NutritionValues } from '@/lib/nutrition';
import { NUTRITION_FIELDS } from '@/lib/validation';

export interface OffNutrition {
  calories: number | null;
  fatG: number | null;
  saturatedFatG: number | null;
  carbsG: number | null;
  proteinG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
}

export interface OffProduct {
  barcode: string | null;
  /** First brand from OFF's comma-separated `brands` field, or null. */
  brand: string | null;
  found: boolean;
  name: string | null;
  nutrition: OffNutrition;
  /** OFF serving_quantity in grams/ml, or null when absent. */
  servingG: number | null;
  ingredientsText: string | null;
  tags: string[];
}

/** Coerce an unknown value to a finite, non-negative number, or null. */
function num(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return null;
  return n;
}

function round(value: number | null, decimals: number): number | null {
  if (value == null) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

const EMPTY_NUTRITION: OffNutrition = {
  calories: null,
  fatG: null,
  saturatedFatG: null,
  carbsG: null,
  proteinG: null,
  fiberG: null,
  sugarG: null,
  sodiumMg: null,
};

/**
 * Parse one raw OFF product node — the shape found at `root.product` in a
 * product-lookup response, or one entry of `root.products` in a search
 * response — into an OffProduct. `barcode` is the caller's authoritative code
 * for a product lookup; pass null to fall back to the node's own `code` field
 * (search results carry their own, and may have none).
 */
function mapOffProductJson(barcode: string | null, product: Record<string, unknown>): OffProduct {
  const nutriments = asRecord(product.nutriments);

  const resolvedBarcode = barcode ?? (typeof product.code === 'string' ? product.code : null);

  const nameRaw = product.product_name;
  const name = typeof nameRaw === 'string' && nameRaw.trim().length > 0 ? nameRaw.trim() : null;

  const brandsRaw = product.brands;
  const brand =
    typeof brandsRaw === 'string' && brandsRaw.trim().length > 0
      ? brandsRaw.split(',')[0].trim()
      : null;

  const ingredientsTextRaw = product.ingredients_text;
  const ingredientsText =
    typeof ingredientsTextRaw === 'string' && ingredientsTextRaw.trim().length > 0
      ? ingredientsTextRaw.trim()
      : null;

  const tags = extractTags({
    ingredientsText,
    allergensTags: product.allergens_tags,
    additivesTags: product.additives_tags,
  });

  let sodiumMg = num(nutriments['sodium_100g']);
  if (sodiumMg != null) {
    sodiumMg = sodiumMg * 1000; // grams → mg
  } else {
    const saltG = num(nutriments['salt_100g']);
    sodiumMg = saltG != null ? (saltG / 2.5) * 1000 : null;
  }

  const nutrition: OffNutrition = {
    calories: round(num(nutriments['energy-kcal_100g']), 0),
    fatG: round(num(nutriments['fat_100g']), 1),
    saturatedFatG: round(num(nutriments['saturated-fat_100g']), 1),
    carbsG: round(num(nutriments['carbohydrates_100g']), 1),
    proteinG: round(num(nutriments['proteins_100g']), 1),
    fiberG: round(num(nutriments['fiber_100g']), 1),
    sugarG: round(num(nutriments['sugars_100g']), 1),
    sodiumMg: round(sodiumMg, 0),
  };

  const servingG = num(product.serving_quantity);

  return { barcode: resolvedBarcode, brand, found: true, name, nutrition, servingG, ingredientsText, tags };
}

/**
 * Map a raw OFF `/api/v2/product/{barcode}.json` response to an OffProduct.
 * Uses per-100g nutriments. Sodium is reported in grams by OFF and converted to
 * milligrams (falling back to salt/2.5 when sodium is absent).
 */
export function mapOffResponse(barcode: string, json: unknown): OffProduct {
  const root = asRecord(json);
  const found = num(root.status) === 1 || root.status === 1;
  if (!found) {
    return {
      barcode,
      brand: null,
      found: false,
      name: null,
      nutrition: { ...EMPTY_NUTRITION },
      servingG: null,
      ingredientsText: null,
      tags: [],
    };
  }

  return mapOffProductJson(barcode, asRecord(root.product));
}

/**
 * Map a raw OFF `/cgi/search.pl` (Generic_Search) response into candidate
 * products, most-scanned first (the request sorts by unique_scans_n). Entries
 * with no product name are dropped — OFF search returns plenty of incomplete
 * community entries — and the result is capped at 5.
 */
export function mapOffSearchResponse(json: unknown): OffProduct[] {
  const root = asRecord(json);
  const products = Array.isArray(root.products) ? root.products : [];
  return products
    .map((p) => mapOffProductJson(null, asRecord(p)))
    .filter((p) => p.name != null)
    .slice(0, 5);
}

function nutritionToInputs(nutrition: NutritionValues): NutritionInputs {
  return NUTRITION_FIELDS.reduce((acc, field) => {
    const value = nutrition[field];
    acc[field] = value == null ? '' : String(value);
    return acc;
  }, {} as NutritionInputs);
}

/** Convert a looked-up product into form prefill state for the manual entry form. */
export function offProductToFormState(product: OffProduct): Partial<LogEntryFormState> {
  const servingG = product.servingG ?? 100;
  const base: NutritionValues = { ...product.nutrition };
  const scaled = servingG === 100 ? base : scaleNutrition(base, servingG);
  return {
    name: product.name ?? '',
    barcode: product.barcode,
    nutrition: nutritionToInputs(scaled),
    servingG: String(servingG),
    nutritionBase: base,
    ingredientsText: product.ingredientsText ?? '',
    tagsJson: serializeTags(product.tags),
  };
}

/** Convert a looked-up product into prefill state for a meal-builder component form. */
export function offProductToComponentFormState(product: OffProduct): Partial<ComponentFormState> {
  const servingG = product.servingG ?? 100;
  const base: NutritionValues = { ...product.nutrition };
  const scaled = servingG === 100 ? base : scaleNutrition(base, servingG);
  return {
    name: product.name ?? '',
    barcode: product.barcode,
    nutrition: nutritionToInputs(scaled),
    servingG: String(servingG),
    nutritionBase: base,
    ingredientsText: product.ingredientsText ?? '',
    tagsJson: serializeTags(product.tags),
  };
}
