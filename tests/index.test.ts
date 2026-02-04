import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { rolldownBuild } from '@sxzz/test-utils'
import { describe, expect, test } from 'vitest'
import { dts } from '../src/index.ts'
import { getTsgoPathFromNodeModules } from '../src/tsgo.ts'

const dirname = path.dirname(fileURLToPath(import.meta.url))

test('basic', async () => {
  const { snapshot } = await rolldownBuild(
    path.resolve(dirname, 'fixtures/basic.ts'),
    [dts()],
  )
  expect(snapshot).toMatchSnapshot()
})

test('tsx', async () => {
  const { snapshot } = await rolldownBuild(
    path.resolve(dirname, 'fixtures/tsx.tsx'),
    [dts()],
  )
  expect(snapshot).toMatchSnapshot()
})

test('resolve dependencies', async () => {
  const { snapshot } = await rolldownBuild(
    path.resolve(dirname, 'fixtures/resolve-dep.ts'),
    [
      dts({
        oxc: true,
        emitDtsOnly: true,
      }),
    ],
    { external: ['rolldown'] },
  )
  expect(snapshot).contain('type TsConfigResult')
  expect(snapshot).not.contain('node_modules/rolldown')
})

test('resolve dts', async () => {
  const { snapshot } = await rolldownBuild(
    path.resolve(dirname, 'fixtures/resolve-dts/index.ts'),
    [dts()],
  )
  expect(snapshot).matchSnapshot()
})

// Test alias mapping based on rolldown input option
test('input alias', async () => {
  const root = path.resolve(dirname, 'fixtures/alias')
  const { snapshot, chunks } = await rolldownBuild(
    // A mapping from output chunk names to input files. This mapping should
    // be used in both JS and DTS outputs.
    {
      output1: 'input1.ts',
      'output2/index': 'input2.ts',
    },
    [dts({ emitDtsOnly: false })],
    { cwd: root },
  )
  const fileNames = chunks.map((chunk) => chunk.fileName).toSorted()

  // The JS output and DTS output should have the same structure
  expect(fileNames).toContain('output1.d.ts')
  expect(fileNames).toContain('output1.js')
  expect(fileNames).toContain('output2/index.d.ts')
  expect(fileNames).toContain('output2/index.js')

  expect(snapshot).toMatchSnapshot()
})

test('isolated declaration error', async () => {
  const error = await rolldownBuild(
    path.resolve(dirname, 'fixtures/isolated-decl-error.ts'),
    [
      dts({
        emitDtsOnly: true,
        oxc: true,
      }),
    ],
  ).catch((error: any) => error)
  expect(String(error)).toContain(
    `Function must have an explicit return type annotation with --isolatedDeclarations.`,
  )
  expect(String(error)).toContain(`export function fn() {`)
})

test('tree-shaking', async () => {
  const { snapshot } = await rolldownBuild(
    path.resolve(dirname, 'fixtures/tree-shaking/index.ts'),
    [
      dts(),
      {
        name: 'external-node',
        resolveId(id) {
          if (id.startsWith('node:'))
            return { id, external: true, moduleSideEffects: false }
        },
      },
    ],
    { treeshake: true },
  )
  expect(snapshot).matchSnapshot()
})

describe('dts input', () => {
  test('input array', async () => {
    const { snapshot, chunks } = await rolldownBuild(
      [path.resolve(dirname, 'fixtures/dts-input.d.ts')],
      [dts({ dtsInput: true })],
      {},
    )
    expect(chunks[0].fileName).toBe('dts-input.d.ts')
    expect(snapshot).toMatchSnapshot()
  })

  test('input object', async () => {
    const { snapshot, chunks } = await rolldownBuild(
      { index: path.resolve(dirname, 'fixtures/dts-input.d.ts') },
      [dts({ dtsInput: true })],
    )
    expect(chunks[0].fileName).toBe('index.d.ts')
    expect(snapshot).toMatchSnapshot()
  })

  test('.d in chunk name', async () => {
    const { chunks } = await rolldownBuild(
      { 'index.d': path.resolve(dirname, 'fixtures/dts-input.d.ts') },
      [dts({ dtsInput: true })],
    )
    expect(chunks[0].fileName).toBe('index.d.ts')
  })

  test('full extension in chunk name', async () => {
    const { chunks } = await rolldownBuild(
      { 'index.d.mts': path.resolve(dirname, 'fixtures/dts-input.d.ts') },
      [dts({ dtsInput: true })],
    )
    expect(chunks[0].fileName).toBe('index.d.mts')
  })

  test('custom entryFileNames with .d', async () => {
    const { chunks } = await rolldownBuild(
      { index: path.resolve(dirname, 'fixtures/dts-input.d.ts') },
      [dts({ dtsInput: true })],
      {},
      {
        entryFileNames: '[name].d.cts',
      },
    )
    expect(chunks[0].fileName).toBe('index.d.cts')
  })

  test('custom entryFileNames without .d', async () => {
    const { chunks } = await rolldownBuild(
      [path.resolve(dirname, 'fixtures/dts-input.d.ts')],
      [dts({ dtsInput: true })],
      {},
      { entryFileNames: '[name].mts' },
    )
    expect(chunks[0].fileName).toBe('dts-input.d.mts')
  })

  test('custom entryFileNames function', async () => {
    const { chunks } = await rolldownBuild(
      { index: path.resolve(dirname, 'fixtures/dts-input.d.ts') },
      [dts({ dtsInput: true })],
      {},
      {
        entryFileNames: () => '[name].mts',
      },
    )
    expect(chunks[0].fileName).toBe('index.d.mts')
  })

  test('invalid entryFileNames gets overridden with stripped .d', async () => {
    const { chunks } = await rolldownBuild(
      { 'index.d': path.resolve(dirname, 'fixtures/dts-input.d.ts') },
      [dts({ dtsInput: true })],
      {},
      { entryFileNames: '[name].invalid' },
    )
    expect(chunks[0].fileName).toBe('index.d.ts')
  })

  test('invalid entryFileNames gets overridden and preserves subextension', async () => {
    const { chunks } = await rolldownBuild(
      { 'index.asdf': path.resolve(dirname, 'fixtures/dts-input.d.ts') },
      [dts({ dtsInput: true })],
      {},
      { entryFileNames: '[name].invalid' },
    )
    expect(chunks[0].fileName).toBe('index.asdf.d.ts')
  })

  test('default chunk name', async () => {
    const { snapshot, chunks } = await rolldownBuild(
      [
        path.resolve(dirname, 'fixtures/dts-multi-input/input1.d.ts'),
        path.resolve(dirname, 'fixtures/dts-multi-input/input2.d.ts'),
      ],
      [dts({ dtsInput: true })],
      {},
      {
        entryFileNames: '[name].mts',
      },
    )

    const chunkNames = chunks.map((chunk) => chunk.fileName).toSorted()
    expect(chunkNames).toMatchInlineSnapshot(`
      [
        "input1.d.mts",
        "input2.d.mts",
        "types-B0jSiKC_.d.ts",
      ]
    `)

    expect(snapshot).toMatchSnapshot()
  })

  test('custom chunk name', async () => {
    const { snapshot, chunks } = await rolldownBuild(
      [
        path.resolve(dirname, 'fixtures/dts-multi-input/input1.d.ts'),
        path.resolve(dirname, 'fixtures/dts-multi-input/input2.d.ts'),
      ],
      [dts({ dtsInput: true })],
      {},
      {
        chunkFileNames: 'chunks/[hash]-[name].ts',
      },
    )

    const chunkNames = chunks.map((chunk) => chunk.fileName).toSorted()
    expect(chunkNames).toMatchInlineSnapshot(`
      [
        "chunks/BCXvBysl-types.d.ts",
        "input1.d.ts",
        "input2.d.ts",
      ]
    `)

    expect(snapshot).toMatchSnapshot()
  })
})

describe('entryFileNames', () => {
  test('.mjs -> .d.mts', async () => {
    const { chunks } = await rolldownBuild(
      [path.resolve(dirname, 'fixtures/basic.ts')],
      [dts()],
      {},
      {
        entryFileNames: '[name].mjs',
      },
    )

    const chunkNames = chunks.map((chunk) => chunk.fileName).toSorted()
    expect(chunkNames).toStrictEqual(['basic.d.mts', 'basic.mjs'])
  })

  test('.cjs -> .d.cts', async () => {
    const { chunks } = await rolldownBuild(
      [path.resolve(dirname, 'fixtures/basic.ts')],
      [dts()],
      {},
      {
        entryFileNames: '[name].cjs',
      },
    )

    const chunkNames = chunks.map((chunk) => chunk.fileName).toSorted()
    expect(chunkNames).toStrictEqual(['basic.cjs', 'basic.d.cts'])
  })

  test('.mjs -> .d.mts with custom chunk name', async () => {
    const { chunks } = await rolldownBuild(
      { custom: path.resolve(dirname, 'fixtures/basic.ts') },
      [dts()],
      {},
      { entryFileNames: '[name].mjs' },
    )

    const chunkNames = chunks.map((chunk) => chunk.fileName).toSorted()
    expect(chunkNames).toStrictEqual(['custom.d.mts', 'custom.mjs'])
  })

  test('preserves invalid extension', async () => {
    const { chunks } = await rolldownBuild(
      [path.resolve(dirname, 'fixtures/basic.ts')],
      [dts()],
      {},
      {
        entryFileNames: '[name].invalid',
      },
    )

    const chunkNames = chunks.map((chunk) => chunk.fileName).toSorted()
    expect(chunkNames).toStrictEqual(['basic.d.invalid', 'basic.invalid'])
  })

  test('same-name output (for JS & DTS)', async () => {
    const { chunks } = await rolldownBuild(
      [path.resolve(dirname, 'fixtures/same-name/index.ts')],
      [dts()],
      {},
      {
        preserveModules: true,
        entryFileNames: 'foo.d.ts',
      },
    )

    expect(chunks.every((chunk) => chunk.fileName.endsWith('.d.ts'))).toBe(true)
  })

  test('default chunk name', async () => {
    const { chunks, snapshot } = await rolldownBuild(
      [
        path.resolve(dirname, 'fixtures/alias/input1.ts'),
        path.resolve(dirname, 'fixtures/alias/input2.ts'),
      ],
      [dts({ emitDtsOnly: true })],
      {},
      {
        entryFileNames: '[name].mjs',
      },
    )

    const chunkNames = chunks.map((chunk) => chunk.fileName).toSorted()
    expect(chunkNames).toMatchInlineSnapshot(`
      [
        "input1.d.mts",
        "input2-459dIHr0.d.ts",
        "input2.d.mts",
      ]
    `)

    expect(snapshot).toMatchSnapshot()
  })

  test('custom chunk name', async () => {
    const { snapshot, chunks } = await rolldownBuild(
      [
        path.resolve(dirname, 'fixtures/dts-multi-input/input1.d.ts'),
        path.resolve(dirname, 'fixtures/dts-multi-input/input2.d.ts'),
      ],
      [dts({ emitDtsOnly: true })],
      {},
      {
        chunkFileNames: 'chunks/[hash]-[name].js',
      },
    )

    const chunkNames = chunks.map((chunk) => chunk.fileName).toSorted()
    expect(chunkNames).toMatchInlineSnapshot(`
      [
        "chunks/BCXvBysl-types.d.ts",
        "input1.d.ts",
        "input2.d.ts",
      ]
    `)

    expect(snapshot).toMatchSnapshot()
  })
})

test('type-only export', async () => {
  const { snapshot } = await rolldownBuild(
    [path.resolve(dirname, 'fixtures/type-only-export/index.ts')],
    [dts({ emitDtsOnly: true })],
  )
  expect(snapshot).toMatchSnapshot()
})

test('cjs exports', async () => {
  {
    const { snapshot } = await rolldownBuild(
      [path.resolve(dirname, 'fixtures/cjs-exports.ts')],
      [],
      {},
      { format: 'cjs', exports: 'auto' },
    )
    expect(snapshot).toMatchSnapshot()
  }

  {
    const { snapshot } = await rolldownBuild(
      [path.resolve(dirname, 'fixtures/cjs-exports.ts')],
      [dts({ emitDtsOnly: true, cjsDefault: true })],
    )
    expect(snapshot).toMatchSnapshot()
  }
})

test('declare module', async () => {
  const { snapshot } = await rolldownBuild(
    path.resolve(dirname, 'fixtures/declare-module.ts'),
    [
      dts({
        emitDtsOnly: true,
      }),
    ],
    { platform: 'node' },
  )
  expect(snapshot).toMatchSnapshot()
})

test('should error when file import cannot be found', async () => {
  await expect(() =>
    rolldownBuild(path.resolve(dirname, 'fixtures/unresolved-import/ts.ts'), [
      dts({
        emitDtsOnly: true,
      }),
    ]),
  ).rejects.toThrow("Could not resolve './missing-file'")
})

test('manualChunks', async () => {
  const { snapshot, chunks } = await rolldownBuild(
    path.resolve(dirname, 'fixtures/manual-chunk/entry.ts'),
    [dts({ emitDtsOnly: true })],
    {},
    {
      manualChunks(id) {
        if (id.includes('shared1')) return 'shared1-chunk.d'
      },
    },
  )
  expect(snapshot).toMatchSnapshot()
  expect(chunks).toHaveLength(2)
})

test('codeSplitting', async () => {
  const { snapshot, chunks } = await rolldownBuild(
    path.resolve(dirname, 'fixtures/manual-chunk/entry.ts'),
    [dts({ emitDtsOnly: true })],
    {},
    {
      codeSplitting: {
        groups: [{ test: /shared1/, name: 'shared1-chunk.d' }],
      },
    },
  )
  expect(snapshot).toMatchSnapshot()
  expect(chunks).toHaveLength(2)
})

test('re-export from lib', async () => {
  const cwd = path.resolve(dirname, 'fixtures/re-export-lib')
  const { snapshot: onlyA } = await rolldownBuild(
    ['a.ts'],
    [dts({ emitDtsOnly: true })],
    { cwd },
  )
  const { snapshot: onlyB } = await rolldownBuild(
    ['b.ts'],
    [dts({ emitDtsOnly: true })],
    { cwd },
  )
  const { snapshot: both } = await rolldownBuild(
    ['a.ts', 'b.ts'],
    [dts({ emitDtsOnly: true })],
    { cwd },
  )
  expect(onlyA).toMatchSnapshot('onlyA')
  expect(onlyB).toMatchSnapshot('onlyB')
  expect(both).toMatchSnapshot('both')
})

test('cyclic import', async () => {
  const cwd = path.resolve(dirname, 'fixtures/cyclic-import')
  const { snapshot } = await rolldownBuild(
    ['a.ts', 'b.ts'],
    [dts({ emitDtsOnly: true })],
    { cwd },
  )
  expect(snapshot).toMatchSnapshot()
})

test('side effects', async () => {
  const { snapshot } = await rolldownBuild(
    path.resolve(dirname, 'fixtures/side-effects/index.ts'),
    [
      dts({
        emitDtsOnly: true,
        sideEffects: true,
      }),
    ],
    {},
    { preserveModules: true },
  )
  expect(snapshot).toMatchSnapshot()
})

test('infer type parameter', async () => {
  const { snapshot } = await rolldownBuild(
    path.resolve(dirname, 'fixtures/infer-type-param.ts'),
    [dts({ emitDtsOnly: true })],
  )
  expect(snapshot).toMatchSnapshot()
  // Ensure type parameter U is not renamed to U$1
  expect(snapshot).toContain('Fn1<U = unknown>')
  expect(snapshot).not.toContain('U$1')
})

test('infer false branch', async () => {
  const { snapshot } = await rolldownBuild(
    path.resolve(dirname, 'fixtures/infer-false-branch/index.ts'),
    [dts({ emitDtsOnly: true })],
  )
  expect(snapshot).toMatchSnapshot()
  expect(snapshot).toContain(
    'T extends Array<infer U> ? (T extends Array<infer U2> ? U2 : U) : ',
  )
})

test('tsgo with custom path', async () => {
  const tsgoPath = await getTsgoPathFromNodeModules()
  const { snapshot } = await rolldownBuild(
    path.resolve(dirname, 'fixtures/basic.ts'),
    [
      dts({
        tsgo: { path: tsgoPath },
        tsconfig: path.resolve(dirname, 'fixtures/basic.tsconfig.json'),
      }),
    ],
  )
  expect(snapshot).toMatchSnapshot()
})

// https://github.com/sxzz/rolldown-plugin-dts/issues/136
test('css.ts files', async () => {
  const root = path.resolve(dirname, 'fixtures/css-ts')
  const { snapshot } = await rolldownBuild(path.resolve(root, 'index.ts'), [
    dts({ emitDtsOnly: true }),
  ])
  expect(snapshot).toMatchSnapshot()
})

// https://github.com/rolldown/tsdown/issues/170
test('real css imports are externalized', async () => {
  const root = path.resolve(dirname, 'fixtures/css-real')
  const { snapshot } = await rolldownBuild(path.resolve(root, 'index.ts'), [
    dts({ emitDtsOnly: true }),
  ])
  expect(snapshot).toMatchSnapshot()
  expect(snapshot).not.toContain('.main')
})

test('sub namespace', async () => {
  const { snapshot } = await rolldownBuild(
    path.resolve(dirname, 'fixtures/sub-namespace.ts'),
    [dts({ emitDtsOnly: true })],
  )
  expect(snapshot).toMatchSnapshot()
})

test('deterministic namespace import index', async () => {
  const cwd = path.resolve(dirname, 'fixtures/import-type-multi')
  // Build multiple times to verify deterministic output
  const results: string[] = []
  for (let i = 0; i < 3; i++) {
    const { snapshot } = await rolldownBuild(
      ['a.d.ts', 'b.d.ts', 'c.d.ts'],
      [
        dts({
          dtsInput: true,
          tsconfig: path.resolve(cwd, 'tsconfig.json'),
          emitDtsOnly: true,
        }),
      ],
      { cwd },
    )
    results.push(snapshot)
    expect(snapshot).toMatchSnapshot()
  }

  // All results should be identical
  expect(results[0]).toBe(results[1])
  expect(results[1]).toBe(results[2])
  // Valid identifiers (stub_lib) don't need index suffix
  expect(results[0]).toContain('import * as stub_lib from "stub_lib"')
  // Should not have stub_lib0 since each file is independent
  expect(results[0]).not.toContain('stub_lib0')
})

/**
 * Test for @types/* package internalization with module augmentation.
 *
 * Real-world scenario (from @rtvision/types):
 * 1. Library imports from 'json-schema' (provided by @types/json-schema devDependency)
 * 2. Library augments JSONSchema7 with custom properties (label, table, meta, etc.)
 * 3. Library exports types that use JSONSchema7
 * 4. Consumer imports the bundled types and accesses augmented properties
 *
 * Problem: When @types/json-schema is internalized (devDep, not peerDep), the bundled
 * output contains:
 * - interface TestSchema { $id?; type?; ... } - inlined from @types, NO augmented properties
 * - declare module "test-schema" { interface TestSchema { label?; ... } } - separate block!
 *
 * The `declare module` augmentation only applies to the external module 'test-schema',
 * but since the types were inlined, there's no external module. The local interface
 * at the top level doesn't get the augmented properties.
 *
 * Result: Consumers get TS2339: "Property 'label' does not exist on type 'TestSchema'"
 */
test('@types/* internalization merges module augmentations', async () => {
  const cwd = path.resolve(dirname, 'fixtures/at-types-internalization')
  const distDir = path.resolve(cwd, 'dist')

  // Build the library
  const { chunks } = await rolldownBuild(
    ['index.ts'],
    [dts({ emitDtsOnly: true })],
    { cwd, treeshake: true },
  )

  // Write output to dist/ so consumer can import it
  fs.rmSync(distDir, { recursive: true, force: true })
  fs.mkdirSync(distDir, { recursive: true })
  for (const chunk of chunks) {
    if (chunk.fileName.endsWith('.d.ts') && 'code' in chunk) {
      fs.writeFileSync(path.resolve(distDir, chunk.fileName), chunk.code)
    }
  }

  // Create a consumer file that uses the augmented property
  const consumerCode = `
import type { JsonSchema } from './dist/index';

// This should work if augmentation is properly merged
const schema: JsonSchema = {};
const label: string | undefined = schema.label;
`
  const consumerFile = path.resolve(cwd, 'consumer.ts')
  fs.writeFileSync(consumerFile, consumerCode)

  // Run tsc to check if consumer can use augmented properties
  let tscError: string | null = null
  try {
    execSync('pnpm exec tsc --noEmit --skipLibCheck consumer.ts', {
      cwd,
      stdio: 'pipe',
      encoding: 'utf-8',
    })
    // If we get here, tsc passed - augmentation worked
  } catch (error: any) {
    tscError = error.stdout?.toString() || error.stderr?.toString() || ''
  } finally {
    // Clean up
    if (fs.existsSync(consumerFile)) fs.rmSync(consumerFile)
    if (fs.existsSync(distDir))
      fs.rmSync(distDir, { recursive: true, force: true })
  }

  // This is the expected failure - TS2339 means augmentation didn't merge
  if (tscError && tscError.includes('TS2339') && tscError.includes('label')) {
    throw new Error(
      `Module augmentation not merged with inlined interface.\n` +
        `Consumer gets TS2339 when accessing augmented property 'label'.\n` +
        `This happens because 'declare module "test-schema"' doesn't apply to the local inlined interface.\n\n` +
        `tsc output:\n${tscError}`,
    )
  }

  // If tscError is set but not TS2339, something else went wrong
  if (tscError) {
    throw new Error(`Unexpected tsc error:\n${tscError}`)
  }

  // If we get here, the test passed (augmentation works correctly)
})
