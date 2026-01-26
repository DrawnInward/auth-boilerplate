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
import { useOrganizationInvitations, useCancelInvitation } from "@/api/queries/organizations";
import { useApiError } from "@/hooks";
import { LoadingSpinner } from "@/components/shared";

interface InvitationsListProps {
  orgId: string;
}

export function InvitationsList({ orgId }: InvitationsListProps) {
  const { data, isLoading } = useOrganizationInvitations(orgId);
  const cancelInvitation = useCancelInvitation(orgId);
  const { handleError } = useApiError();

  const invitations = data?.data ?? [];
  const pendingInvitations = invitations.filter((inv) => !inv.used_at);

  const handleCancel = async (invitationId: string) => {
    try {
      await cancelInvitation.mutateAsync(invitationId);
      toast.success("Invitation cancelled");
    } catch (error) {
      handleError(error);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center py-8"><LoadingSpinner /></div>;
  }

  if (pendingInvitations.length === 0) {
    return (
      <p className="py-8 text-center text-muted-foreground">
        No pending invitations
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Expires</TableHead>
          <TableHead className="w-[100px]">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {pendingInvitations.map((invitation) => (
          <TableRow key={invitation.id}>
            <TableCell>{invitation.email}</TableCell>
            <TableCell>
              <Badge variant="outline">{invitation.role}</Badge>
            </TableCell>
            <TableCell>
              {new Date(invitation.expires_at).toLocaleDateString()}
            </TableCell>
            <TableCell>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCancel(invitation.id!)}
                disabled={cancelInvitation.isPending}
              >
                Cancel
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
