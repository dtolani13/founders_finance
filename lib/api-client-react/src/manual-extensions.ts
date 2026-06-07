import { useMutation, useQuery } from "@tanstack/react-query";
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

export interface EntityLifecycleBody {
  archive_until?: string | null;
  archive_reason?: string | null;
}

export const getListAllEntitiesQueryKey = () => ["/api/entities", { include_inactive: true }] as const;

export function listAllEntities(): Promise<Entity[]> {
  return customFetch<Entity[]>("/api/entities?include_inactive=true", {
    method: "GET",
    responseType: "json",
  });
}

export function useListAllEntities() {
  return useQuery({
    queryKey: getListAllEntitiesQueryKey(),
    queryFn: listAllEntities,
  });
}

function entityLifecycleAction(id: string, action: "close" | "archive" | "reopen", data?: EntityLifecycleBody): Promise<Entity> {
  return customFetch<Entity>(`/api/entities/${id}/${action}`, {
    method: "POST",
    body: JSON.stringify(data ?? {}),
    responseType: "json",
  });
}

export function useCloseEntity(
  options?: UseMutationOptions<Entity, Error, { id: string; data?: EntityLifecycleBody }>,
): UseMutationResult<Entity, Error, { id: string; data?: EntityLifecycleBody }> {
  return useMutation({
    mutationFn: ({ id, data }) => entityLifecycleAction(id, "close", data),
    ...options,
  });
}

export function useArchiveEntity(
  options?: UseMutationOptions<Entity, Error, { id: string; data?: EntityLifecycleBody }>,
): UseMutationResult<Entity, Error, { id: string; data?: EntityLifecycleBody }> {
  return useMutation({
    mutationFn: ({ id, data }) => entityLifecycleAction(id, "archive", data),
    ...options,
  });
}

export function useReopenEntity(
  options?: UseMutationOptions<Entity, Error, { id: string }>,
): UseMutationResult<Entity, Error, { id: string }> {
  return useMutation({
    mutationFn: ({ id }) => entityLifecycleAction(id, "reopen"),
    ...options,
  });
}
