import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Zod-parse-equivalent validation + normalization, driven by the JSON
 * Schemas committed under schemas/ (exported from gezel's Zod shapes by
 * packages/catalog/scripts/export-gilde-schemas.ts).
 *
 * Why this exists: gezel's catalog runtime feeds every manifest through
 * a Zod `.parse()` before the index-build merge. That parse (a) strips
 * unknown object keys, (b) REORDERS known keys into schema-shape order,
 * and (c) materializes `default` values at their shape position. All
 * three are visible in the committed index bytes (e.g. toolset `config`
 * entries are shape-ordered, `secret`/`required`/`multiline` defaults
 * materialize), so build-index must replicate them exactly to stay
 * byte-identical. Zod 4's toJSONSchema preserves the shape's property
 * order and default annotations, which lets one engine serve every kind
 * without hand-porting each schema.
 *
 * Fidelity caveat (mirrors schemas/README.md): refinements/superRefines
 * are dropped by the export, so this engine is slightly LOOSER than the
 * runtime Zod parse. Anything that passes Zod passes here; the reverse
 * gap (e.g. the llamaCpp filename-xor-shards refine) has no instances in
 * the committed data - the build-index --check gate is the empirical
 * proof.
 *
 * Supported vocabulary (exactly what the exporter emits): type, const,
 * enum, pattern, minLength, maxLength, minimum, maximum,
 * exclusiveMinimum, format(uri), properties, required,
 * additionalProperties, propertyNames, items, minItems, maxItems,
 * oneOf, anyOf, default.
 */

const SCHEMA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'schemas');

const schemaCache = new Map();
const regexCache = new Map();

export function loadSchema(name) {
  let s = schemaCache.get(name);
  if (!s) {
    s = JSON.parse(readFileSync(join(SCHEMA_DIR, `${name}.schema.json`), 'utf8'));
    schemaCache.set(name, s);
  }
  return s;
}

function compiled(pattern) {
  let re = regexCache.get(pattern);
  if (!re) {
    re = new RegExp(pattern);
    regexCache.set(pattern, re);
  }
  return re;
}

function typeOk(type, value) {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'null':
      return value === null;
    case 'array':
      return Array.isArray(value);
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    default:
      return true;
  }
}

function fail(errors, path, message) {
  errors.push(`${path || '/'}: ${message}`);
  return undefined;
}

/**
 * Validate `value` against `schema` and return the normalized value, or
 * record errors and return undefined. `errors` collects strings; an
 * empty array on return means success (undefined is also a legitimate
 * normalized value only when errors grew - callers check errors.length).
 */
function run(schema, value, path, errors) {
  if (schema === true || schema == null) return value;
  if (schema === false) return fail(errors, path, 'schema false');
  const keys = Object.keys(schema);
  if (keys.length === 0) return value; // z.unknown() - passthrough

  // Union branches: first branch that validates wins (Zod union order /
  // discriminated-union semantics - branch consts are disjoint).
  const branches = schema.oneOf ?? schema.anyOf;
  if (branches) {
    for (const branch of branches) {
      const sub = [];
      const out = run(branch, value, path, sub);
      if (sub.length === 0) return out;
    }
    return fail(errors, path, 'no union branch matched');
  }

  if (schema.const !== undefined && value !== schema.const) {
    return fail(errors, path, `expected const ${JSON.stringify(schema.const)}`);
  }
  if (schema.enum && !schema.enum.includes(value)) {
    return fail(errors, path, `not in enum`);
  }

  const types = schema.type === undefined ? null : Array.isArray(schema.type) ? schema.type : [schema.type];
  if (types && !types.some((t) => typeOk(t, value))) {
    return fail(errors, path, `expected ${types.join('|')}`);
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      return fail(errors, path, `shorter than ${schema.minLength}`);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      return fail(errors, path, `longer than ${schema.maxLength}`);
    }
    if (schema.pattern !== undefined && !compiled(schema.pattern).test(value)) {
      return fail(errors, path, `does not match pattern ${schema.pattern}`);
    }
    if (schema.format === 'uri' && !URL.canParse(value)) {
      return fail(errors, path, 'not a valid URL');
    }
    return value;
  }

  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      return fail(errors, path, `below minimum ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      return fail(errors, path, `above maximum ${schema.maximum}`);
    }
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) {
      return fail(errors, path, `not above ${schema.exclusiveMinimum}`);
    }
    return value;
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      return fail(errors, path, `fewer than ${schema.minItems} items`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      return fail(errors, path, `more than ${schema.maxItems} items`);
    }
    if (schema.items === undefined) return value;
    const out = new Array(value.length);
    for (let i = 0; i < value.length; i++) {
      const before = errors.length;
      out[i] = run(schema.items, value[i], `${path}/${i}`, errors);
      if (errors.length > before) return undefined;
    }
    return out;
  }

  if (typeof value === 'object' && value !== null) {
    if (schema.properties) {
      // z.object(): known keys in shape order, defaults materialized at
      // their shape position, unknown keys stripped.
      const out = {};
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (Object.hasOwn(value, key)) {
          const before = errors.length;
          const v = run(propSchema, value[key], `${path}/${key}`, errors);
          if (errors.length > before) return undefined;
          out[key] = v;
        } else if (propSchema && typeof propSchema === 'object' && 'default' in propSchema) {
          out[key] = structuredClone(propSchema.default);
        } else if (schema.required?.includes(key)) {
          return fail(errors, path, `missing required key "${key}"`);
        }
      }
      return out;
    }
    if (schema.additionalProperties !== undefined || schema.propertyNames !== undefined) {
      // z.record(): every key kept in input order, values validated.
      const out = {};
      for (const [key, v] of Object.entries(value)) {
        if (schema.propertyNames) {
          const before = errors.length;
          run(schema.propertyNames, key, `${path}/(key ${key})`, errors);
          if (errors.length > before) return undefined;
        }
        const before = errors.length;
        out[key] = run(schema.additionalProperties ?? {}, v, `${path}/${key}`, errors);
        if (errors.length > before) return undefined;
      }
      return out;
    }
    return value; // bare { type: "object" } - passthrough
  }

  return value;
}

/**
 * Parse `value` the way gezel's Zod schema would: returns
 * { ok: true, value } with the normalized (stripped / shape-ordered /
 * defaulted) result, or { ok: false, errors } listing the first failure
 * per branch point.
 */
export function zodParse(schema, value) {
  const errors = [];
  const out = run(schema, value, '', errors);
  return errors.length === 0 ? { ok: true, value: out } : { ok: false, errors };
}
