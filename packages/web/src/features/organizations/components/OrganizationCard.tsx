import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { OrganizationWithRole } from "@auth-boilerplate/shared";

interface OrganizationCardProps {
  organization: OrganizationWithRole;
}

export function OrganizationCard({ organization }: OrganizationCardProps) {
  return (
    <Link to={`/organizations/${organization.id}`}>
      <Card className="transition-colors hover:bg-muted/50">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">{organization.name}</CardTitle>
            <Badge variant="outline">{organization.role}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">/{organization.slug}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
