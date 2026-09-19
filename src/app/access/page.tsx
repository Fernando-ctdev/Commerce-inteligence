import { AccessForm } from "@/components/access/access-form";
import { isRegistrationEnabled } from "@/modules/identity/http";

type AccessPageProps = {
  searchParams: Promise<{ reason?: string | string[] }>;
};

export default async function AccessPage({ searchParams }: AccessPageProps) {
  const { reason } = await searchParams;

  return (
    <AccessForm
      registrationEnabled={isRegistrationEnabled()}
      sessionExpired={reason === "session-expired"}
    />
  );
}
