import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useOrganizationMembers,
  useUpdateMemberRole,
  useRemoveMember,
  type OrganizationMemberWithEmail,
} from "@/api/queries/organizations";
import { useAuth } from "@/hooks";
import { useApiError } from "@/hooks";
import { LoadingSpinner } from "@/components/shared";

interface MembersListProps {
  orgId: string;
  userRole: string;
}

export function MembersList({ orgId, userRole }: MembersListProps) {
  const { user } = useAuth();
  const { data, isLoading } = useOrganizationMembers(orgId);
  const updateRole = useUpdateMemberRole(orgId);
  const removeMember = useRemoveMember(orgId);
  const { handleError } = useApiError();

  const [memberToRemove, setMemberToRemove] =
    useState<OrganizationMemberWithEmail | null>(null);

  const canManageMembers = userRole === "owner" || userRole === "admin";
  const members = data?.data ?? [];

  const handleRoleChange = async (
    userId: string,
    role: "admin" | "member" | "viewer",
  ) => {
    try {
      await updateRole.mutateAsync({ userId, data: { role } });
      toast.success("Role updated successfully");
    } catch (error) {
      handleError(error);
    }
  };

  const handleRemove = async () => {
    if (!memberToRemove) return;
    try {
      await removeMember.mutateAsync(memberToRemove.user_id);
      toast.success("Member removed successfully");
      setMemberToRemove(null);
    } catch (error) {
      handleError(error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            {canManageMembers && (
              <TableHead className="w-[100px]">Actions</TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => (
            <TableRow key={member.id}>
              <TableCell>
                {member.email}
                {member.user_id === user?.user_id && (
                  <Badge variant="secondary" className="ml-2">
                    You
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                {canManageMembers &&
                member.role !== "owner" &&
                member.user_id !== user?.user_id ? (
                  <Select
                    value={member.role}
                    onValueChange={(value) =>
                      handleRoleChange(
                        member.user_id,
                        value as "admin" | "member" | "viewer",
                      )
                    }
                  >
                    <SelectTrigger className="w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge
                    variant={member.role === "owner" ? "default" : "outline"}
                  >
                    {member.role}
                  </Badge>
                )}
              </TableCell>
              {canManageMembers && (
                <TableCell>
                  {member.role !== "owner" &&
                    member.user_id !== user?.user_id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setMemberToRemove(member)}
                      >
                        Remove
                      </Button>
                    )}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <AlertDialog
        open={!!memberToRemove}
        onOpenChange={() => setMemberToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {memberToRemove?.email} from this
              organization?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemove}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
