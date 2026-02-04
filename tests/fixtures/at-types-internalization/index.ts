/**
 * This fixture mirrors the pattern from @rtvision/types/src/api/Options.ts
 *
 * Real-world scenario:
 * 1. Import types from 'json-schema' (@types/json-schema is a devDependency)
 * 2. Augment JSONSchema7 with custom properties (label, table, meta, etc.)
 * 3. Export type aliases that use the augmented interface
 *
 * When built with tsdown/rolldown-plugin-dts:
 * - @types/json-schema is internalized (bundled) because it's a devDependency
 * - The interface from @types gets inlined into the bundle
 * - BUT the module augmentation stays as `declare module "json-schema" { ... }`
 * - This augmentation doesn't apply to the local inlined interface!
 *
 * Result: Consumer packages get TS2339 errors like:
 *   "Property 'label' does not exist on type 'JSONSchema7'"
 */
import type { TestSchema, TestSchemaDefinition } from 'test-schema'

// Augment TestSchema with custom properties (mirrors json-schema augmentation)
declare module 'test-schema' {
  interface TestSchema {
    // Custom properties added by @rtvision/types
    label?: string
    table?: string
    meta?: TestSchema
  }
}

// Re-export the type (pattern from Options.ts line 120: export type JsonSchema = JSONSchema7)
export type JsonSchema = TestSchema

export interface SchemaConfig {
  schema: TestSchema
  definitions?: Record<string, TestSchemaDefinition>
}

// Function that accesses augmented property - works in source, fails for consumers after bundle
export function getLabel(schema: JsonSchema): string | undefined {
  return schema.label
}
