// Public test-only values. Never use these keys in a real deployment.
process.env.AUTH_JWT_SECRET = "a".repeat(64);
process.env.AUTH_CSRF_SECRET = "b".repeat(64);
