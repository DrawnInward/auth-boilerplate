import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { PublicUser } from "@auth-boilerplate/shared";

interface UserCardsProps {
  users: PublicUser[];
}

export function UserCards({ users }: UserCardsProps) {
  return (
    <div className="grid gap-4">
      {users.map((user) => (
        <Card key={user.user_id}>
          <CardContent className="flex items-center justify-between gap-4 pt-6">
            <div className="min-w-0 flex-1 space-y-2">
              <p className="truncate font-medium">{user.email}</p>
              <div className="flex flex-wrap gap-1">
                <Badge variant={user.is_active ? "default" : "secondary"}>
                  {user.is_active ? "Active" : "Inactive"}
                </Badge>
                <Badge variant={user.email_verified ? "default" : "outline"}>
                  {user.email_verified ? "Verified" : "Unverified"}
                </Badge>
                {user.mfa_enabled && <Badge variant="default">MFA</Badge>}
                <Badge variant="outline">{user.auth_provider}</Badge>
              </div>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to={`/admin/users/${user.user_id}`}>View</Link>
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
