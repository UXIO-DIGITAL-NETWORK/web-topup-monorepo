import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";

import { Command, Search } from "lucide-react";

import { useBranding } from "@/hooks/useBranding";
import { ENV } from "@/config/env";
import { NAV_GROUPS } from "../data/nav-groups.data";
import { Box } from "@/components/common/Box";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useSidebar } from "@/hooks/useSidebar";
import { WebsiteSubscriptionCard } from "./WebsiteSubscriptionCard";
import { Text } from "@/components/common/Text";
import { Link } from "@/components/common/Link";
import { cn } from "@/lib/utils";

export function DashboardSidebar() {
  const { t } = useTranslation("dashboard");
  const { siteName } = useBranding();

  const [commandOpen, setCommandOpen] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { state } = useSidebar();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const goTo = (href: string) => {
    setCommandOpen(false);
    navigate({ to: href as unknown as string });
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              asChild
            >
              <Link href="/admin/dashboard">
                <Box className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Command className="size-4" />
                </Box>
                <Box className="grid flex-1 text-left text-sm leading-tight">
                  <Text
                    as="span"
                    className="truncate text-sm font-semibold"
                  >
                    {t("adminDashboard")}
                  </Text>
                  <Text
                    as="span"
                    className="truncate text-xs"
                  >
                    {siteName}
                  </Text>
                </Box>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <Box className={cn("relative", state !== "collapsed" && "px-1")}>
          {state === "collapsed" ? (
            <Box
              as="button"
              type="button"
              onClick={() => setCommandOpen(true)}
              aria-label={t("search")}
              className="ring-offset-background flex size-8 items-center justify-center rounded-lg border border-input bg-transparent dark:bg-input/30 text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Search className="size-4" />
            </Box>
          ) : (
            <Box
              as="button"
              type="button"
              onClick={() => setCommandOpen(true)}
              className="ring-offset-background flex h-8 w-full items-center gap-1.5 rounded-lg border border-input bg-transparent dark:bg-input/30 px-2.5 text-sm text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Search className="size-4 shrink-0" />
              <Text
                as="span"
                className="flex-1 text-left"
              >
                {t("search")}
              </Text>
              <Text
                as="span"
                className="rounded-md bg-muted px-1 text-xs font-medium"
              >
                ⌘ F
              </Text>
            </Box>
          )}
        </Box>
      </SidebarHeader>

      <SidebarContent className="[&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.labelKey}>
            <SidebarGroupLabel>{t(group.labelKey)}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive = !item.disabled && (pathname === item.href || pathname.startsWith(`${item.href}/`));
                  return (
                    <SidebarMenuItem key={item.labelKey}>
                      <SidebarMenuButton
                        asChild={!item.disabled}
                        isActive={isActive}
                        disabled={item.disabled}
                        className={cn(
                          "rounded-lg text-foreground hover:bg-accent hover:text-foreground",
                          "data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:hover:bg-primary data-[active=true]:hover:text-primary-foreground",
                          item.disabled && "disabled:opacity-100",
                        )}
                      >
                        {item.disabled ? (
                          <>
                            <item.icon className="size-4" />
                            <Text
                              as="span"
                              className="text-current"
                            >
                              {t(item.labelKey)}
                            </Text>
                          </>
                        ) : (
                          <Link href={item.href}>
                            <item.icon className="size-4" />
                            <Text
                              as="span"
                              className="text-current"
                            >
                              {t(item.labelKey)}
                            </Text>
                          </Link>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {/* The site's own subscription. Sits below the nav so it is the last
          thing an admin sees, and links out to where it is actually renewed. */}
      <SidebarFooter>
        <WebsiteSubscriptionCard />
        {/* The release stamp. Rendered only when the build carried one, so a
            local build shows nothing instead of a meaningless version. */}
        {ENV.APP_VERSION && (
          <Text
            as="span"
            className="px-2 pb-1 text-center text-[10px] text-muted-foreground"
          >
            {ENV.APP_VERSION}
          </Text>
        )}
      </SidebarFooter>

      <CommandDialog
        open={commandOpen}
        onOpenChange={setCommandOpen}
      >
        <CommandInput placeholder={t("jumpToPage")} />
        <CommandList>
          <CommandEmpty>{t("noResults")}</CommandEmpty>
          {NAV_GROUPS.map((group) => (
            <CommandGroup
              key={group.labelKey}
              heading={t(group.labelKey)}
            >
              {group.items.map((item) => (
                <CommandItem
                  key={item.labelKey}
                  disabled={item.disabled}
                  onSelect={() => goTo(item.href)}
                >
                  <item.icon className="mr-2 size-4" />
                  {t(item.labelKey)}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </Sidebar>
  );
}
