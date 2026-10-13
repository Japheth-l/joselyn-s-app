import { describe, expect, it } from "vitest";
import { adminCredentials, isLocalDatabase } from "../../prisma/seed-policy";

describe("isLocalDatabase", () => {
  it.each([
    "postgresql://postgres@localhost:5433/ntoma_dev",
    "postgresql://u:p@127.0.0.1/ntoma",
    "postgresql://u@[::1]:5432/ntoma",
    "postgresql://u@localhost/ntoma?host=/var/run/postgresql",
  ])("local: %s", (url) => expect(isLocalDatabase(url)).toBe(true));

  it.each([
    "postgresql://ntoma:secret@dpg-abc123-a/ntoma", // Render internal URL
    "postgresql://ntoma:secret@dpg-abc123-a.frankfurt-postgres.render.com/ntoma", // Render external URL
    "postgresql://u@localhost.evil.example/ntoma",
    "postgresql://u@127.0.0.1.nip.io/ntoma",
    "postgresql://u@localhost/ntoma?host=db.example.com",
    "postgresql://u@/ntoma?host=/var/run/postgresql", // not a valid URL: treated as not local
    "not a url",
    "",
    undefined,
  ])("not local: %s", (url) => expect(isLocalDatabase(url)).toBe(false));
});

describe("adminCredentials", () => {
  const strong = "a-long-random-password";

  it("uses the development defaults only when explicit credentials are not required", () => {
    expect(adminCredentials({}, { explicitRequired: false })).toEqual({ email: "admin@ntoma.example", password: "local-admin-password", source: "development default" });
    expect(() => adminCredentials({}, { explicitRequired: true })).toThrow("ADMIN_EMAIL is not set; ADMIN_PASSWORD is not set");
  });

  it("accepts explicit, strong credentials and normalises the email", () => {
    expect(adminCredentials({ ADMIN_EMAIL: " Owner@Example.com ", ADMIN_PASSWORD: strong }, { explicitRequired: true })).toEqual({
      email: "owner@example.com", password: strong, source: "environment",
    });
  });

  it.each([
    [{ ADMIN_PASSWORD: strong }, "ADMIN_EMAIL is not set"],
    [{ ADMIN_EMAIL: "owner@example.com" }, "ADMIN_PASSWORD is not set"],
    [{ ADMIN_EMAIL: "owner@example.com", ADMIN_PASSWORD: "" }, "ADMIN_PASSWORD is not set"],
    [{ ADMIN_EMAIL: "not-an-email", ADMIN_PASSWORD: strong }, "not an email address"],
    [{ ADMIN_EMAIL: "admin@ntoma.example", ADMIN_PASSWORD: strong }, "development address"],
    [{ ADMIN_EMAIL: "owner@example.com", ADMIN_PASSWORD: "elevenchars" }, "shorter than 12"],
    [{ ADMIN_EMAIL: "owner@example.com", ADMIN_PASSWORD: "LOCAL-ADMIN-PASSWORD" }, "known default"],
    [{ ADMIN_EMAIL: "owner@example.com", ADMIN_PASSWORD: "owner@example.com" }, "known default"],
  ])("rejects %o", (env, message) => {
    expect(() => adminCredentials(env, { explicitRequired: true })).toThrow(message);
  });

  it("never puts the password in the error message", () => {
    try {
      adminCredentials({ ADMIN_EMAIL: "x", ADMIN_PASSWORD: "tiny-secret" }, { explicitRequired: true });
      expect.unreachable();
    } catch (e) {
      expect(String(e)).not.toContain("tiny-secret");
    }
  });
});
