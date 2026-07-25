import { Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks";
import { useOrganizations } from "@/api/queries/organizations";

export function DashboardPage() {
  const { user } = useAuth();
  const { data: orgsData } = useOrganizations();

  const organizations = orgsData?.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Welcome back</h1>
        <p className="text-muted-foreground">{user?.email}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Account Status</CardDescription>
            <CardTitle className="text-lg">
              {user?.is_active ? (
                <Badge variant="default">Active</Badge>
              ) : (
                <Badge variant="destructive">Inactive</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground">
              {user?.email_verified ? "Email verified" : "Email not verified"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Security</CardDescription>
            <CardTitle className="text-lg">
              {user?.mfa_enabled ? (
                <Badge variant="default">MFA Enabled</Badge>
              ) : (
                <Badge variant="secondary">MFA Disabled</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="link" className="h-auto p-0" asChild>
              <Link to="/settings">Manage security settings</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Organizations</CardDescription>
            <CardTitle className="text-2xl">{organizations.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="link" className="h-auto p-0" asChild>
              <Link to="/organizations">View organizations</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {organizations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Your Organizations</CardTitle>
            <CardDescription>
              Quick access to your organizations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              {organizations.slice(0, 6).map((org) => (
                <Link
                  key={org.id}
                  to={`/organizations/${org.id}`}
                  className="flex items-center justify-between rounded-md border p-3 hover:bg-muted"
                >
                  <span className="font-medium">{org.name}</span>
                  <Badge variant="outline">{org.role}</Badge>
                </Link>
              ))}
            </div>
            {organizations.length > 6 && (
              <Button variant="link" className="mt-2" asChild>
                <Link to="/organizations">
                  View all ({organizations.length})
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
