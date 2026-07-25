import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { OrganizationWithMemberCount } from "@auth-boilerplate/shared";

interface OrgCardsProps {
  organizations: OrganizationWithMemberCount[];
}

export function OrgCards({ organizations }: OrgCardsProps) {
  return (
    <div className="grid gap-4">
      {organizations.map((org) => (
        <Card key={org.id}>
          <CardContent className="flex items-center justify-between gap-4 pt-6">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="truncate font-medium">{org.name}</p>
              <p className="text-sm text-muted-foreground">
                /{org.slug} · {org.member_count}{" "}
                {org.member_count === 1 ? "member" : "members"}
              </p>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to={`/admin/organizations/${org.id}`}>View</Link>
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
