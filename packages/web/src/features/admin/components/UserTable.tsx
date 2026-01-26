import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PublicUser } from "@auth-boilerplate/shared";

interface UserTableProps {
  users: PublicUser[];
}

export function UserTable({ users }: UserTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Email</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Verified</TableHead>
          <TableHead>MFA</TableHead>
          <TableHead>Provider</TableHead>
          <TableHead className="w-[100px]">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => (
          <TableRow key={user.user_id}>
            <TableCell className="font-medium">{user.email}</TableCell>
            <TableCell>
              <Badge variant={user.is_active ? "default" : "secondary"}>
                {user.is_active ? "Active" : "Inactive"}
              </Badge>
            </TableCell>
            <TableCell>
              <Badge variant={user.email_verified ? "default" : "outline"}>
                {user.email_verified ? "Verified" : "Unverified"}
              </Badge>
            </TableCell>
            <TableCell>
              {user.mfa_enabled ? (
                <Badge variant="default">Enabled</Badge>
              ) : (
                <Badge variant="outline">Disabled</Badge>
              )}
            </TableCell>
            <TableCell>
              <Badge variant="outline">{user.auth_provider}</Badge>
            </TableCell>
            <TableCell>
              <Button variant="ghost" size="sm" asChild>
                <Link to={`/admin/users/${user.user_id}`}>View</Link>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
