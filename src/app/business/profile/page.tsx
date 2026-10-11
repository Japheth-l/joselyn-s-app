import { requireUser } from "@/lib/auth";
import { ProfileForm } from "./profile-form";

export default async function ProfilePage() {
  const user = await requireUser("BUSINESS");
  const b = user.business!;
  return (
    <ProfileForm
      business={{ name: b.name, description: b.description, phone: b.phone, address: b.address, city: b.city, lat: b.lat, lng: b.lng }}
    />
  );
}
