import "server-only";
import type { z } from "zod";
import { invalid } from "@/lib/actions";
import { firstError, formObject } from "./schemas";

/** Builds a defineAction `parse` function from a zod schema. */
export function parseForm<T extends z.ZodType>(schema: T) {
  return (formData: FormData) => {
    const result = schema.safeParse(formObject(formData));
    return result.success ? (result.data as z.infer<T>) : invalid(firstError(result.error));
  };
}
