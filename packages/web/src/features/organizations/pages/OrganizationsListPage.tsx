import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useOrganizations } from "@/api/queries/organizations";
import { OrganizationCard, CreateOrgModal } from "../components";
import { LoadingSpinner } from "@/components/shared";
import { useAuth } from "@/hooks";

export function OrganizationsListPage() {
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const { data, isLoading } = useOrganizations();
  const { user } = useAuth();

  const organizations = data?.data ?? [];
  const canCreateOrgs = user?.can_create_orgs ?? false;

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center text-center gap-4 sm:flex-row sm:items-center sm:justify-between sm:text-left">
        <div>
          <h1 className="text-3xl font-bold">Organizations</h1>
          <p className="text-muted-foreground">Manage your organizations</p>
        </div>
        {canCreateOrgs && (
          <Button
            onClick={() => setCreateModalOpen(true)}
            className="w-full sm:w-auto"
          >
            Create Organization
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : organizations.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-muted-foreground">
            You're not a member of any organizations yet.
          </p>
          {canCreateOrgs && (
            <Button className="mt-4" onClick={() => setCreateModalOpen(true)}>
              Create your first organization
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {organizations.map((org) => (
            <OrganizationCard key={org.id} organization={org} />
          ))}
        </div>
      )}

      {canCreateOrgs && (
        <CreateOrgModal
          open={createModalOpen}
          onOpenChange={setCreateModalOpen}
        />
      )}
    </div>
  );
}
