import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { OrganizationWithMemberCount } from "@auth-boilerplate/shared";

interface OrgTableProps {
  organizations: OrganizationWithMemberCount[];
}

export function OrgTable({ organizations }: OrgTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Slug</TableHead>
          <TableHead>Members</TableHead>
          <TableHead>Created</TableHead>
          <TableHead className="w-[100px]">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {organizations.map((org) => (
          <TableRow key={org.id}>
            <TableCell className="font-medium">{org.name}</TableCell>
            <TableCell>/{org.slug}</TableCell>
            <TableCell>{org.member_count}</TableCell>
            <TableCell>
              {org.created_at ? new Date(org.created_at).toLocaleDateString() : "-"}
            </TableCell>
            <TableCell>
              <Button variant="ghost" size="sm" asChild>
                <Link to={`/admin/organizations/${org.id}`}>View</Link>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
