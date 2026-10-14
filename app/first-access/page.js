import FirstAccessClient from "./first-access-client";

export default async function FirstAccessPage({ searchParams }) {
  const { tenantId } = await searchParams;
  return <FirstAccessClient tenantId={Array.isArray(tenantId) ? "" : tenantId ?? ""} />;
}
