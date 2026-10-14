import LoginClient from "./login-client";

export default async function LoginPage({ searchParams }) {
  const { tenantId } = await searchParams;
  return <LoginClient initialTenantId={Array.isArray(tenantId) ? "" : tenantId ?? ""} />;
}
