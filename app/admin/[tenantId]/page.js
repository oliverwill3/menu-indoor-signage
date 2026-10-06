import AdminClient from "./admin-client";

export default async function TenantAdminPage({ params }) {
  const { tenantId } = await params;
  return <AdminClient tenantId={tenantId} />;
}
