import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  createOrganizationDtoSchema,
  type CreateOrganizationDto,
} from "@auth-boilerplate/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { useCreateOrganization } from "@/api/queries/organizations";
import { useApiError } from "@/hooks";

interface CreateOrgModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateOrgModal({ open, onOpenChange }: CreateOrgModalProps) {
  const createOrg = useCreateOrganization();
  const { handleError } = useApiError();

  const form = useForm<CreateOrganizationDto>({
    resolver: zodResolver(createOrganizationDtoSchema),
    defaultValues: { name: "", slug: "" },
  });

  const handleSubmit = async (data: CreateOrganizationDto) => {
    try {
      await createOrg.mutateAsync(data);
      toast.success("Organization created successfully");
      form.reset();
      onOpenChange(false);
    } catch (error) {
      handleError(error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Organization</DialogTitle>
          <DialogDescription>
            Create a new organization to collaborate with others
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="My Organization" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Slug (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="my-organization" {...field} />
                  </FormControl>
                  <FormDescription>
                    URL-friendly identifier. Auto-generated if left empty.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createOrg.isPending}>
                {createOrg.isPending ? "Creating..." : "Create"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
