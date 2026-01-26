import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAdminOrganizations } from "@/api/queries/admin";
import { OrgTable } from "../components";
import { LoadingSpinner } from "@/components/shared";

export function AdminOrgsPage() {
  const { data, isLoading } = useAdminOrganizations({ limit: 100 });

  const organizations = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Organizations</h1>
        <p className="text-muted-foreground">Manage organizations</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Organizations</CardTitle>
          <CardDescription>
            {data?.pagination?.total ?? 0} total organizations
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : organizations.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No organizations found</p>
          ) : (
            <OrgTable organizations={organizations} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
