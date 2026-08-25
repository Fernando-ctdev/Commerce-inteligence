import { TodayEmpty } from "@/components/today/today-empty";
import { requireSession } from "@/modules/identity/application/require-session";

export default async function TodayPage() {
  await requireSession();

  return <TodayEmpty />;
}
