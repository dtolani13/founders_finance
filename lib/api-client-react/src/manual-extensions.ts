import { useMutation } from "@tanstack/react-query";
import type { UseMutationOptions, UseMutationResult } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";
import type { Entity } from "./generated/api.schemas";

export interface CreateEntityBody {
  legal_name: string;
  display_name: string;
  short_code: string;
  entity_type?: string;
  purpose?: string | null;
  tax_classification_note?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  accent_color?: string | null;
}

export function createEntity(data: CreateEntityBody): Promise<Entity> {
  return customFetch<Entity>("/api/entities", {
    method: "POST",
    body: JSON.stringify(data),
    responseType: "json",
  });
}

export function useCreateEntity(
  options?: UseMutationOptions<Entity, Error, CreateEntityBody>,
): UseMutationResult<Entity, Error, CreateEntityBody> {
  return useMutation({
    mutationFn: createEntity,
    ...options,
  });
}
