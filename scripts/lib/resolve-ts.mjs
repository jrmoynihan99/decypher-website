/**
 * Let a plain `node` script import the app's TypeScript.
 *
 * Node 24 strips types natively, but its ESM resolver insists on file
 * extensions, and the app's source imports `./schema`, not `./schema.ts`.
 * This hook retries a relative specifier that didn't resolve with `.ts`,
 * `.tsx` and `/index.ts`. Nothing else changes.
 *
 * Use:  node --import ./scripts/lib/resolve-ts.mjs scripts/whatever.mjs
 * Only for modules with no `@/` aliases and no server-only imports.
 */
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(`
      import { existsSync } from "node:fs";
      import { fileURLToPath } from "node:url";
      export async function resolve(specifier, context, next) {
        const relative = specifier.startsWith("./") || specifier.startsWith("../");
        if (!relative || !context.parentURL) return next(specifier, context);
        try {
          return await next(specifier, context);
        } catch (e) {
          if (e?.code !== "ERR_MODULE_NOT_FOUND") throw e;
          const base = new URL(specifier, context.parentURL).href;
          for (const ext of [".ts", ".tsx", "/index.ts"]) {
            if (existsSync(fileURLToPath(base + ext))) return next(base + ext, context);
          }
          throw e;
        }
      }
    `),
);
