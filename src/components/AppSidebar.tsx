import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  DollarSign,
  Flame,
  Radio,
  Network,
  PlayCircle,
  Activity,
  MoreVertical,
  LogOut,
  Unplug,
  UserCircle,
  Pencil,
  KeyRound,
  Trash2,
} from "lucide-react";
import freitasLogo from "@/assets/freitas-logo.jpg.asset.json";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";

const mainItems: {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  badge?: string;
  badgeClass?: string;
}[] = [
  { title: "Histórico", url: "/", icon: LayoutDashboard },
  { title: "Sinais", url: "/sinais", icon: Radio },
  { title: "Estratégias", url: "/estrategias", icon: Network },
  { title: "Vídeos", url: "/videos", icon: PlayCircle },
];

const blazeItems = [
  { title: "Blaze Dashboard", url: "/blaze", icon: Activity },
  {
    title: "Hostman Branco",
    url: "/hostman",
    icon: Flame,
    badge: "NOVO",
    badgeClass: "bg-red-500 text-white",
  },
];

export function AppSidebar() {
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (path: string) => currentPath === path;

  return (
    <Sidebar collapsible="icon" className="border-r border-border bg-[#0C0C0C]">
      <SidebarHeader className="border-b border-border bg-[#0C0C0C]">
        <div className="flex items-center gap-2 px-1 py-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:gap-2">
          <div
            className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-white ring-1 ring-white/40"
            style={{ boxShadow: "var(--shadow-glow)" }}
          >
            <img src={freitasLogo.url} alt="Freitas Blaze" className="h-full w-full object-cover" />
          </div>
          <div className="flex-1 min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-bold tracking-tight font-outfit">
              Freitas da Blaze
            </p>
            <p className="truncate text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Análise do Histórico da Blaze
            </p>
          </div>
          <SidebarTrigger />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] tracking-widest font-mono text-muted-foreground">
            PRINCIPAL
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => {
                const active = isActive(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.title}
                      className={
                        active
                          ? "bg-[#FF1F3D]/10 border border-[#FF1F3D]/30 text-white shadow-[0_0_15px_rgba(255,31,61,0.1)]"
                          : "hover:bg-white/[0.03] text-[#9CA3AF] hover:text-white"
                      }
                    >
                      <Link to={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span className="font-semibold">{item.title}</span>
                        {item.badge && (
                          <Badge
                            className={`ml-auto text-[9px] font-mono tracking-widest px-2 py-0 h-4 group-data-[collapsible=icon]:hidden ${item.badgeClass}`}
                          >
                            {item.badge}
                          </Badge>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] tracking-widest font-mono text-muted-foreground">
            BLAZE
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {blazeItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <Link to={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span className="font-semibold">{item.title}</span>
                      {item.badge && (
                        <Badge
                          className={`ml-auto text-[9px] font-mono tracking-widest px-2 py-0 h-4 group-data-[collapsible=icon]:hidden ${item.badgeClass}`}
                        >
                          {item.badge}
                        </Badge>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-border gap-2">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface/60 px-3 py-2 group-data-[collapsible=icon]:hidden">
          <Unplug className="h-4 w-4 text-muted-foreground" />
          <span className="text-[11px] font-mono tracking-widest text-muted-foreground flex-1">
            NÃO CONECTADO
          </span>
          <span className="text-xs text-muted-foreground">---</span>
        </div>
        <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-bold text-sm relative">
            AD
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 border-2 border-background" />
          </div>
          <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
            <div className="font-bold text-sm truncate">Admin</div>
            <Badge className="text-[9px] font-mono tracking-widest bg-surface-2 text-muted-foreground border border-border h-4 px-1.5">
              MEMBRO
            </Badge>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-surface/60 hover:bg-surface-2 group-data-[collapsible=icon]:hidden"
                aria-label="Opções da conta"
              >
                <MoreVertical className="h-4 w-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-64 bg-surface border-border">
              <DropdownMenuItem className="gap-3 py-2.5">
                <UserCircle className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1">Minha Conta</span>
                <Badge className="bg-amber-500 text-black text-[10px] font-mono h-5 px-2">
                  22h
                </Badge>
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-3 py-2.5">
                <Pencil className="h-4 w-4 text-muted-foreground" />
                <span>Trocar nome de exibição</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-3 py-2.5">
                <KeyRound className="h-4 w-4 text-muted-foreground" />
                <span>Trocar senha</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="gap-3 py-2.5 text-red-400 focus:text-red-400 focus:bg-red-500/10">
                <Trash2 className="h-4 w-4" />
                <span>Excluir conta</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-surface/60 hover:bg-surface-2 group-data-[collapsible=icon]:hidden">
            <LogOut className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
