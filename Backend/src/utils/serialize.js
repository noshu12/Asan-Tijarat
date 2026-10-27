/**
 * Converts lean Mongoose docs to the exact wire format the frontend
 * expects: `_id` → `id`, and `__v` removed (frontend interfaces use `id`).
 */
function toClient(doc) {
  if (!doc) return doc;
  if (Array.isArray(doc)) return doc.map(toClient);
  const { _id, __v, ...rest } = doc;
  return { id: String(_id), ...rest };
}

module.exports = { toClient };