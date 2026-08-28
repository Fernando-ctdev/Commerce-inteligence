import { requireSession } from "@/modules/identity/application/require-session";
import { redirect } from "next/navigation";

export default async function NewProductPage() {
  await requireSession();
  redirect("/today");
}
