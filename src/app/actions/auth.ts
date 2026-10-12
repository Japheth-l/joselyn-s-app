"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { BUSINESS_KINDS, CITIES, ROLE_HOME, type Role } from "@/lib/constants";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/session";

export type FormState = { error?: string } | undefined;

const base = z.object({
  name: z.string().trim().min(2, "Enter your full name"),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  phone: z.string().trim().regex(/^\+?[0-9 ]{9,15}$/, "Enter a valid phone number, e.g. 024 123 4567"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["CLIENT", "BUSINESS", "MEASURER", "RIDER"]),
  city: z.string().refine((c) => c in CITIES, "Choose your city"),
});

const businessFields = z.object({
  businessName: z.string().trim().min(2, "Enter your business name"),
  kind: z.enum(Object.keys(BUSINESS_KINDS) as [keyof typeof BUSINESS_KINDS]),
  address: z.string().trim().min(3, "Enter your shop address or landmark"),
  registrationNumber: z.string().trim().min(5, "Enter your business registration or Ghana Card number"),
});

const agentFields = z.object({
  ghanaCardNumber: z.string().trim().regex(/^GHA-?\d{9}-?\d$/i, "Enter your Ghana Card number, e.g. GHA-123456789-0"),
});

async function startSession(user: { id: string; role: string; name: string }) {
  const token = await signSession({ userId: user.id, role: user.role as Role, name: user.name });
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions);
}

export async function signup(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = Object.fromEntries(formData);
  const parsed = base.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const data = parsed.data;

  if (await db.user.findUnique({ where: { email: data.email } })) {
    return { error: "An account with this email already exists. Try logging in." };
  }

  const passwordHash = await bcrypt.hash(data.password, 10);
  const loc = CITIES[data.city];
  let user;

  if (data.role === "BUSINESS") {
    const b = businessFields.safeParse(raw);
    if (!b.success) return { error: b.error.issues[0].message };
    user = await db.user.create({
      data: {
        name: data.name, email: data.email, phone: data.phone, passwordHash, role: "BUSINESS",
        business: {
          create: {
            name: b.data.businessName, kind: b.data.kind, address: b.data.address, city: data.city,
            phone: data.phone, registrationNumber: b.data.registrationNumber, lat: loc.lat, lng: loc.lng,
          },
        },
      },
    });
  } else if (data.role === "MEASURER" || data.role === "RIDER") {
    const a = agentFields.safeParse(raw);
    if (!a.success) return { error: a.error.issues[0].message };
    user = await db.user.create({
      data: {
        name: data.name, email: data.email, phone: data.phone, passwordHash, role: data.role,
        verificationStatus: "PENDING", ghanaCardNumber: a.data.ghanaCardNumber.toUpperCase(),
        lat: loc.lat, lng: loc.lng,
      },
    });
  } else {
    user = await db.user.create({
      data: { name: data.name, email: data.email, phone: data.phone, passwordHash, role: "CLIENT", lat: loc.lat, lng: loc.lng },
    });
  }

  await startSession(user);
  redirect(ROLE_HOME[user.role as Role]);
}

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return { error: "Wrong email or password." };
  }
  await startSession(user);
  const next = String(formData.get("next") ?? "");
  // Only follow local paths to avoid open redirects.
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : ROLE_HOME[user.role as Role]);
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/");
}
