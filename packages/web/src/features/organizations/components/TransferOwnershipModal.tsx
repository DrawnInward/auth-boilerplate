import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOrganizationMembers, useTransferOwnership } from "@/api/queries/organizations";
import { useAuth } from "@/features/auth/context/AuthContext";
import { useApiError } from "@/hooks";
import { LoadingSpinner } from "@/components/shared";

interface TransferOwnershipModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
}

export function TransferOwnershipModal({ open, onOpenChange, orgId }: TransferOwnershipModalProps) {
  const { user } = useAuth();
  const { data, isLoading } = useOrganizationMembers(orgId);
  const transferOwnership = useTransferOwnership(orgId);
  const { handleError } = useApiError();

  const [selectedUserId, setSelectedUserId] = useState<string>("");

  const members = data?.data?.filter((m) => m.user_id !== user?.user_id) ?? [];

  const handleTransfer = async () => {
    if (!selectedUserId) return;
    try {
      await transferOwnership.mutateAsync(selectedUserId);
      toast.success("Ownership transferred successfully");
      onOpenChange(false);
    } catch (error) {
      handleError(error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transfer Ownership</DialogTitle>
          <DialogDescription>
            Select a member to transfer ownership to. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-4"><LoadingSpinner /></div>
        ) : (
          <div className="space-y-4">
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a member" />
              </SelectTrigger>
              <SelectContent>
                {members.map((member) => (
                  <SelectItem key={member.user_id} value={member.user_id}>
                    {member.email} ({member.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={!selectedUserId || transferOwnership.isPending}
                onClick={handleTransfer}
              >
                {transferOwnership.isPending ? "Transferring..." : "Transfer Ownership"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
