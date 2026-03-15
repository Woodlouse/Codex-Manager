"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Search, Shield, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { accountClient } from "@/lib/api/account-client";
import { serviceClient } from "@/lib/api/service-client";
import { useAppStore } from "@/lib/store/useAppStore";
import { formatTsFromSeconds } from "@/lib/utils/usage";
import { cn } from "@/lib/utils";
import { RequestLog } from "@/types";

type StatusFilter = "all" | "2xx" | "4xx" | "5xx";

function getStatusBadge(statusCode: number | null) {
  if (statusCode == null) {
    return <Badge variant="secondary">-</Badge>;
  }
  if (statusCode >= 200 && statusCode < 300) {
    return (
      <Badge className="border-green-500/20 bg-green-500/10 text-green-500">
        {statusCode}
      </Badge>
    );
  }
  if (statusCode >= 400 && statusCode < 500) {
    return (
      <Badge className="border-yellow-500/20 bg-yellow-500/10 text-yellow-500">
        {statusCode}
      </Badge>
    );
  }
  return (
    <Badge className="border-red-500/20 bg-red-500/10 text-red-500">
      {statusCode}
    </Badge>
  );
}

function formatDuration(value: number | null): string {
  if (value == null) return "-";
  if (value >= 10_000) return `${Math.round(value / 1000)}s`;
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}s`;
  return `${Math.round(value)}ms`;
}

function fallbackAccountNameFromId(accountId: string): string {
  const raw = accountId.trim();
  if (!raw) return "";
  const sep = raw.indexOf("::");
  if (sep < 0) return "";
  return raw.slice(sep + 2).trim();
}

function fallbackAccountDisplayFromKey(keyId: string): string {
  const raw = keyId.trim();
  if (!raw) return "";
  return `Key ${raw.slice(0, 10)}`;
}

function formatCompactKeyLabel(keyId: string): string {
  if (!keyId) return "-";
  if (keyId.length <= 12) return keyId;
  return `${keyId.slice(0, 8)}...`;
}

function resolveDisplayRequestPath(log: RequestLog): string {
  const originalPath = String(log.originalPath || "").trim();
  if (originalPath) {
    return originalPath;
  }
  return String(log.path || log.requestPath || "").trim();
}

function resolveUpstreamDisplay(upstreamUrl: string): string {
  const raw = String(upstreamUrl || "").trim();
  if (!raw) return "";
  if (raw === "默认" || raw === "本地" || raw === "自定义") {
    return raw;
  }
  try {
    const url = new URL(raw);
    const pathname = url.pathname.replace(/\/+$/, "");
    return pathname ? `${url.host}${pathname}` : url.host;
  } catch {
    return raw;
  }
}

function resolveAccountDisplayName(
  log: RequestLog,
  accountNameMap: Map<string, string>,
): string {
  if (log.accountId) {
    const label = accountNameMap.get(log.accountId);
    if (label) {
      return label;
    }
    const fallbackName = fallbackAccountNameFromId(log.accountId);
    if (fallbackName) {
      return fallbackName;
    }
  }
  return fallbackAccountDisplayFromKey(log.keyId);
}

function AccountKeyInfoCell({
  log,
  accountLabel,
}: {
  log: RequestLog;
  accountLabel: string;
}) {
  const displayAccount = accountLabel || log.accountId || "-";
  const hasNamedAccount =
    Boolean(accountLabel) &&
    accountLabel.trim() !== "" &&
    accountLabel !== log.accountId;

  return (
    <Tooltip>
      <TooltipTrigger render={<div />} className="block text-left">
        <div className="flex flex-col gap-0.5 opacity-80">
          <div className="flex items-center gap-1">
            <Zap className="h-3 w-3 text-yellow-500" />
            <span className="max-w-[140] truncate">{displayAccount}</span>
          </div>
          <div className="flex items-center gap-1 text-[9] text-muted-foreground">
            <Shield className="h-2.5 w-2.5" />
            <span className="font-mono">
              {formatCompactKeyLabel(log.keyId)}
            </span>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm">
        <div className="flex min-w-[240] flex-col gap-2">
          {hasNamedAccount ? (
            <div className="space-y-0.5">
              <div className="text-[10px] text-background/70">邮箱 / 名称</div>
              <div className="break-all font-mono text-[11]">
                {accountLabel}
              </div>
            </div>
          ) : null}
          <div className="space-y-0.5">
            <div className="text-[10px] text-background/70">账号 ID</div>
            <div className="break-all font-mono text-[11]">
              {log.accountId || "-"}
            </div>
          </div>
          <div className="space-y-0.5">
            <div className="text-[10px] text-background/70">密钥</div>
            <div className="break-all font-mono text-[11]">
              {log.keyId || "-"}
            </div>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function RequestRouteInfoCell({ log }: { log: RequestLog }) {
  const displayPath = resolveDisplayRequestPath(log) || "-";
  const recordedPath = String(log.path || log.requestPath || "").trim();
  const originalPath = String(log.originalPath || "").trim();
  const adaptedPath = String(log.adaptedPath || "").trim();
  const upstreamUrl = String(log.upstreamUrl || "").trim();
  const upstreamDisplay = resolveUpstreamDisplay(upstreamUrl);

  return (
    <Tooltip>
      <TooltipTrigger render={<div />} className="block text-left">
        <div className="flex flex-col gap-0.5">
          <span className="font-bold text-primary">{log.method || "-"}</span>
          <span className="max-w-[180] truncate text-muted-foreground">
            {displayPath}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-md">
        <div className="flex min-w-[280] flex-col gap-2">
          <div className="space-y-0.5">
            <div className="text-[10px] text-background/70">方法</div>
            <div className="font-mono text-[11]">{log.method || "-"}</div>
          </div>
          <div className="space-y-0.5">
            <div className="text-[10px] text-background/70">显示地址</div>
            <div className="break-all font-mono text-[11]">{displayPath}</div>
          </div>
          {recordedPath && recordedPath !== displayPath ? (
            <div className="space-y-0.5">
              <div className="text-[10px] text-background/70">记录地址</div>
              <div className="break-all font-mono text-[11]">
                {recordedPath}
              </div>
            </div>
          ) : null}
          {originalPath && originalPath !== displayPath ? (
            <div className="space-y-0.5">
              <div className="text-[10px] text-background/70">原始地址</div>
              <div className="break-all font-mono text-[11]">
                {originalPath}
              </div>
            </div>
          ) : null}
          {adaptedPath && adaptedPath !== displayPath ? (
            <div className="space-y-0.5">
              <div className="text-[10px] text-background/70">转发地址</div>
              <div className="break-all font-mono text-[11]">{adaptedPath}</div>
            </div>
          ) : null}
          {log.responseAdapter ? (
            <div className="space-y-0.5">
              <div className="text-[10px] text-background/70">适配器</div>
              <div className="break-all font-mono text-[11]">
                {log.responseAdapter}
              </div>
            </div>
          ) : null}
          {upstreamDisplay ? (
            <div className="space-y-0.5">
              <div className="text-[10px] text-background/70">上游</div>
              <div className="break-all font-mono text-[11]">
                {upstreamDisplay}
              </div>
            </div>
          ) : null}
          {upstreamUrl ? (
            <div className="space-y-0.5">
              <div className="text-[10px] text-background/70">上游地址</div>
              <div className="break-all font-mono text-[11]">{upstreamUrl}</div>
            </div>
          ) : null}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function ErrorInfoCell({ error }: { error: string }) {
  const text = String(error || "").trim();
  if (!text) {
    return <span className="text-muted-foreground">-</span>;
  }

  return (
    <Tooltip>
      <TooltipTrigger render={<div />} className="block text-left">
        <span className="block max-w-[180] truncate font-medium text-red-400">
          {text}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-md">
        <div className="max-w-[360] break-all font-mono text-[11]">{text}</div>
      </TooltipContent>
    </Tooltip>
  );
}

export default function LogsPage() {
  const searchParams = useSearchParams();
  const { serviceStatus } = useAppStore();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState(() => searchParams.get("query") || "");
  const [filter, setFilter] = useState<StatusFilter>("all");

  const { data: accountsResult } = useQuery({
    queryKey: ["accounts", "lookup"],
    queryFn: () => accountClient.list(),
    enabled: serviceStatus.connected,
    staleTime: 60_000,
    retry: 1,
  });

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["logs", search],
    queryFn: () => serviceClient.listRequestLogs(search, 100),
    enabled: serviceStatus.connected,
    refetchInterval: 5000,
    retry: 1,
  });

  const clearMutation = useMutation({
    mutationFn: () => serviceClient.clearRequestLogs(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["logs"] }),
        queryClient.invalidateQueries({ queryKey: ["today-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["startup-snapshot"] }),
      ]);
      toast.success("日志已清空");
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : String(error));
    },
  });

  const accountNameMap = useMemo(() => {
    return new Map(
      (accountsResult?.items || []).map((account) => [
        account.id,
        account.label || account.name || account.id,
      ]),
    );
  }, [accountsResult?.items]);

  const filteredLogs = useMemo(() => {
    return logs.filter((log: RequestLog) => {
      if (filter === "all") return true;
      const statusCode = log.statusCode ?? 0;
      if (filter === "2xx") return statusCode >= 200 && statusCode < 300;
      if (filter === "4xx") return statusCode >= 400 && statusCode < 500;
      if (filter === "5xx") return statusCode >= 500;
      return true;
    });
  }, [filter, logs]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex max-w-md flex-1 items-center gap-2">
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索路径、账号或密钥..."
              className="glass-card h-10 pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="flex rounded-lg border bg-muted/30 p-1">
            {["all", "2xx", "4xx", "5xx"].map((item) => (
              <button
                key={item}
                onClick={() => setFilter(item as StatusFilter)}
                className={cn(
                  "rounded-md -3 py-1 text-[10px] font-bold transition-all",
                  filter === item
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {item.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="glass-card"
            onClick={() =>
              queryClient.invalidateQueries({ queryKey: ["logs"] })
            }
          >
            <RefreshCw className="mr-2 h-4 w-4" /> 刷新
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => clearMutation.mutate()}
            disabled={clearMutation.isPending}
          >
            <Trash2 className="mr-2 h-4 w-4" /> 清空日志
          </Button>
        </div>
      </div>

      <Card className="glass-card overflow-hidden border-none shadow-xl backdrop-blur-md">
        <CardContent className="p-0">
          <Table className="table-fixed">
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="w-[150]">时间</TableHead>
                <TableHead className="w-[120]">方法 / 路径</TableHead>
                <TableHead className="w-[210]">账号 / 密钥</TableHead>
                <TableHead className="w-[70]">模型</TableHead>
                <TableHead className="w-[70]">状态</TableHead>
                <TableHead className="w-[80]">请求时长</TableHead>
                <TableHead className="w-[110]">令牌</TableHead>
                <TableHead className="w-[180]">错误</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 10 }).map((_, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <Skeleton className="h-4 w-32" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-40" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-32" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-6 w-12 rounded-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-12" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filteredLogs.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="h-48 text-center text-muted-foreground"
                  >
                    {!serviceStatus.connected
                      ? "服务未连接，无法获取日志"
                      : "暂无请求日志"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredLogs.map((log) => (
                  <TableRow
                    key={log.id}
                    className="group text-[11] hover:bg-muted/30"
                  >
                    <TableCell className="font-mono text-muted-foreground">
                      {formatTsFromSeconds(log.createdAt, "未知时间")}
                    </TableCell>
                    <TableCell>
                      <RequestRouteInfoCell log={log} />
                    </TableCell>
                    <TableCell>
                      <AccountKeyInfoCell
                        log={log}
                        accountLabel={resolveAccountDisplayName(
                          log,
                          accountNameMap,
                        )}
                      />
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className="bg-accent/30 text-[9] font-normal"
                      >
                        {log.model || "-"}
                      </Badge>
                    </TableCell>
                    <TableCell>{getStatusBadge(log.statusCode)}</TableCell>
                    <TableCell className="font-mono text-primary">
                      {formatDuration(log.durationMs)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col text-[9] text-muted-foreground">
                        <span>总 {log.totalTokens?.toLocaleString() || 0}</span>
                        <span>
                          输入 {log.inputTokens?.toLocaleString() || 0}
                        </span>
                        <span className="opacity-60">
                          缓存 {log.cachedInputTokens?.toLocaleString() || 0}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-left">
                      <ErrorInfoCell error={log.error} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
