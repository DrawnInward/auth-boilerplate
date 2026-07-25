import { cn } from "@/lib/utils";

interface ErrorMessageProps {
  message: string;
  className?: string;
}

export function ErrorMessage({ message, className }: ErrorMessageProps) {
  return (
    <div
      className={cn(
        "rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive",
        className,
      )}
    >
      {message}
    </div>
  );
}

interface FullPageErrorProps {
  title?: string;
  message: string;
  action?: React.ReactNode;
}

export function FullPageError({
  title = "Something went wrong",
  message,
  action,
}: FullPageErrorProps) {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-4 p-4">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-destructive">{title}</h1>
        <p className="mt-2 text-muted-foreground">{message}</p>
      </div>
      {action}
    </div>
  );
}
