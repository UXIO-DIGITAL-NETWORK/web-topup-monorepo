import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";

import { Command, Search } from "lucide-react";

import { useBranding } from "@/hooks/useBranding";
import { useChangelogSeen } from "@/hooks/useChangelogSeen";
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
  const { hasUnseen } = useChangelogSeen();
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
                    className="truncate text-base font-bold"
                  >{t("adminDashboard")}</Text>
                  <Text
                    as="span"
                    className="truncate text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
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
              className="ring-offset-background flex size-8 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Search className="size-4" />
            </Box>
          ) : (
            <Box
              as="button"
              type="button"
              onClick={() => setCommandOpen(true)}
              className="ring-offset-background flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Search className="size-4 shrink-0" />
              <Text
                as="span"
                className="flex-1 text-left"
              >{t("search")}</Text>
              <Text
                as="span"
                className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium"
              >
                ⌘F
              </Text>
            </Box>
          )}
        </Box>
      </SidebarHeader>

      <SidebarContent className="[&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.labelKey}>
            <SidebarGroupLabel className="text-[10px] font-semibold text-muted-foreground uppercase">
              {t(group.labelKey)}
            </SidebarGroupLabel>
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
                          "rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground",
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
        {/* The release stamp doubles as the way into the changelog: it is where
            the version already appears, so it is where "what changed?" gets
            asked. Rendered only when the build carried a version, so a local
            build shows nothing instead of a meaningless stamp. */}
        {ENV.APP_VERSION && (
          <Link
            href="/admin/changelog"
            className="mx-auto flex items-center gap-1.5 px-2 pb-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
          >
            {ENV.APP_VERSION}
            {/* The dot is the whole point: the notes only get read if something
                says the build moved on. */}
            {hasUnseen && (
              <Box
                as="span"
                aria-label={t("changelogUnread")}
                className="size-1.5 rounded-full bg-primary"
              />
            )}
          </Link>
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
