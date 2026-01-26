import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useOrganizations } from "@/api/queries/organizations";
import { OrganizationCard, CreateOrgModal } from "../components";
import { LoadingSpinner } from "@/components/shared";

export function OrganizationsListPage() {
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const { data, isLoading } = useOrganizations();

  const organizations = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Organizations</h1>
          <p className="text-muted-foreground">Manage your organizations</p>
        </div>
        <Button onClick={() => setCreateModalOpen(true)}>
          Create Organization
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : organizations.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-muted-foreground">You're not a member of any organizations yet.</p>
          <Button className="mt-4" onClick={() => setCreateModalOpen(true)}>
            Create your first organization
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {organizations.map((org) => (
            <OrganizationCard key={org.id} organization={org} />
          ))}
        </div>
      )}

      <CreateOrgModal open={createModalOpen} onOpenChange={setCreateModalOpen} />
    </div>
  );
}
