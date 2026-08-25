import { AccessForm } from "@/components/access/access-form";

type AccessPageProps = {
  searchParams: Promise<{ reason?: string | string[] }>;
};

export default async function AccessPage({ searchParams }: AccessPageProps) {
  const { reason } = await searchParams;

  return <AccessForm sessionExpired={reason === "session-expired"} />;
}
