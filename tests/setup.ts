process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://postgres@localhost:5433/ntoma_test";
process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-123";
process.env.PAYMENTS_MODE = "sandbox";
Object.assign(process.env, { NODE_ENV: "test" });
