// Generic zod-based request validator.
// Usage: router.post("/", validate(schema), handler)
// On failure returns 400 with a readable list of field errors instead of crashing
// the request or leaking a raw Prisma/zod stack trace.
function validate(schema, source = "body") {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const issues = result.error.issues.map((i) => ({
        field: i.path.join(".") || source,
        message: i.message,
      }));
      return res.status(400).json({ error: "Validation failed", issues });
    }
    req[source] = result.data;
    next();
  };
}

module.exports = { validate };
