'use strict';

// safeQuery.js — NoSQL operator-injection guard for raw req.query values
// (Batch 17, Round-5 audit L1).
//
// Express's extended query parser turns `?role[$ne]=admin` into the
// OBJECT { $ne: 'admin' }. Passed straight into a Mongoose filter, that
// object runs as a query operator instead of a plain value. The fix is
// applied at every site that builds a filter from req.query:
//   • queryString() — objects/arrays never become filter values (null),
//     plain strings/numbers are returned as-is;
//   • queryEnum() — same, plus the value must be on an allow-list, so a
//     typo or a smuggled operator can never widen the filter.

/**
 * Coerces one raw query value to a plain string for use in a Mongoose
 * filter. Returns null for objects/arrays (the operator-injection
 * shape), undefined for missing values, and the string otherwise.
 */
function queryString(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

/**
 * Like queryString(), but the value must also be one of `allowed`.
 * Returns the value, undefined when absent, or null when present but
 * not on the allow-list (caller answers 400).
 */
function queryEnum(value, allowed) {
  const str = queryString(value);
  if (str === undefined || str === null) return str;
  return allowed.includes(str) ? str : null;
}

module.exports = { queryString, queryEnum };
