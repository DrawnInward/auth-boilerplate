import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  completeRegistrationSchema,
  type CompleteRegistrationDto,
} from "@auth-boilerplate/shared";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useAdminCompleteRegistration } from "@/api/queries/admin";
import { useApiError } from "@/hooks";

// The password half of the shared contract; the token comes from the URL.
const passwordFormSchema = completeRegistrationSchema.pick({ password: true });
type PasswordFormData = Pick<CompleteRegistrationDto, "password">;

export function AdminCompleteRegistrationPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");
  const completeRegistration = useAdminCompleteRegistration();
  const { handleError } = useApiError();

  const form = useForm<PasswordFormData>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: { password: "" },
  });

  if (!token) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Invalid link</CardTitle>
          <CardDescription>No token provided.</CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <Link to="/admin/login" className="text-primary hover:underline">
            Go to admin sign in
          </Link>
        </CardContent>
      </Card>
    );
  }

  const handleSubmit = async ({ password }: PasswordFormData) => {
    try {
      await completeRegistration.mutateAsync({ token, password });
      toast.success("Admin account created");
      navigate("/admin");
    } catch (error) {
      handleError(error);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle>Set your password</CardTitle>
        <CardDescription>
          Create a password to activate your admin account
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="Create a password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              className="w-full"
              disabled={completeRegistration.isPending}
            >
              {completeRegistration.isPending
                ? "Creating account..."
                : "Complete registration"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
