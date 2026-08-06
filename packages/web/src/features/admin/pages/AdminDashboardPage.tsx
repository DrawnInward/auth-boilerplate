import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  useAdminUserStats,
  useAdminOrganizationStats,
} from "@/api/queries/admin";
import { StatsCard } from "../components";
import { LoadingSpinner } from "@/components/shared";

export function AdminDashboardPage() {
  const { data: userStats, isLoading: usersLoading } = useAdminUserStats();
  const { data: orgStats, isLoading: orgsLoading } =
    useAdminOrganizationStats();

  const users = userStats?.data;
  const orgs = orgStats?.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground">Overview of your application</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {usersLoading ? (
          <div className="col-span-4 flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : (
          <>
            <StatsCard title="Total Users" value={users?.total ?? 0} />
            <StatsCard title="Active Users" value={users?.active ?? 0} />
            <StatsCard title="Verified Users" value={users?.verified ?? 0} />
            <StatsCard title="Inactive Users" value={users?.inactive ?? 0} />
          </>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {orgsLoading ? (
          <div className="col-span-3 flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : (
          <>
            <StatsCard title="Total Organizations" value={orgs?.total ?? 0} />
            <StatsCard title="Total Members" value={orgs?.total_members ?? 0} />
            <StatsCard
              title="New Organizations (30d)"
              value={orgs?.created_last_30_days ?? 0}
            />
          </>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Users</CardTitle>
            <CardDescription>Manage user accounts</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/admin/users">View all users</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Admins</CardTitle>
            <CardDescription>Manage platform admins</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/admin/admins">View all admins</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Organizations</CardTitle>
            <CardDescription>Manage organizations</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/admin/organizations">View all organizations</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
