import TenantRequests from "@/pages/TenantRequests";

/** Sidebar entry: opens the same create dialog as the instance portal, over My Requests. */
export default function TenantLogRequest() {
  return <TenantRequests openCreateOnMount />;
}
