import TvClient from "./tv-client";

export default async function TenantTvPage({ params }) {
  const { tenantId } = await params;
  return <TvClient tenantId={tenantId} />;
}
