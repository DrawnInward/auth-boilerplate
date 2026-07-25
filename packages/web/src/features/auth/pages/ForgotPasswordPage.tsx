import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  forgotPasswordSchema,
  type ForgotPasswordDto,
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
import { useForgotPassword } from "@/api/queries/auth";
import { useApiError } from "@/hooks";

export function ForgotPasswordPage() {
  const [emailSent, setEmailSent] = useState(false);
  const forgotPassword = useForgotPassword();
  const { handleError } = useApiError();

  const form = useForm<ForgotPasswordDto>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const handleSubmit = async (data: ForgotPasswordDto) => {
    try {
      await forgotPassword.mutateAsync(data);
      setEmailSent(true);
    } catch (error) {
      handleError(error);
    }
  };

  if (emailSent) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Check your email</CardTitle>
          <CardDescription>
            If an account exists with that email, we've sent password reset
            instructions.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <Link to="/login" className="text-primary hover:underline">
            Back to sign in
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle>Forgot password?</CardTitle>
        <CardDescription>
          Enter your email and we'll send you a reset link
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="you@example.com"
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
              disabled={forgotPassword.isPending}
            >
              {forgotPassword.isPending ? "Sending..." : "Send reset link"}
            </Button>
          </form>
        </Form>
        <div className="text-center text-sm text-muted-foreground">
          Remember your password?{" "}
          <Link to="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
