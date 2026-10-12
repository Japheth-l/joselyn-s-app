import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { ROLE_HOME, type Role } from "@/lib/constants";

export default async function Dashboard() {
  const user = await requireUser();
  redirect(ROLE_HOME[user.role as Role]);
}
