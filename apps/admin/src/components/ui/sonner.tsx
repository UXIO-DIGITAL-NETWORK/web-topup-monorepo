import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      // Coloured by severity, everywhere: green = success, amber = warning,
      // red = error. `!` is required because sonner's own
      // `[data-sonner-toast]` background/border rules sit at the same
      // specificity, so an unflagged utility could lose on stylesheet order.
      toastOptions={{
        classNames: {
          success: "!bg-success !text-success-foreground !border-success/40",
          warning: "!bg-warning !text-warning-foreground !border-warning/40",
          error: "!bg-destructive !text-destructive-foreground !border-destructive/40",
          info: "!bg-primary !text-primary-foreground !border-primary/40",
          description: "!text-current opacity-90",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
