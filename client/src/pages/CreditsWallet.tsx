import { Layout } from "@/components/layout/Layout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  CreditCard, Zap, ArrowUpRight, ArrowDownRight, Clock,
  TrendingUp, Coins
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

export default function CreditsWallet() {
  const { user: authUser } = useAuth();
  const currentUserId = authUser?.id || null;

  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ["/api/users", currentUserId],
    queryFn: () => api.users.get(currentUserId!),
    enabled: !!currentUserId,
  });

  const { data: wallet } = useQuery({
    queryKey: ["/api/economy/wallet", currentUserId],
    queryFn: () => api.economy.wallet(currentUserId!),
    enabled: !!currentUserId,
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["/api/economy/transactions", currentUserId],
    queryFn: () => api.economy.transactions(currentUserId!, 50),
    enabled: !!currentUserId,
  });

  if (!currentUserId) {
    return (
      <Layout>
        <div className="text-center py-20 text-muted-foreground">
          <CreditCard className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">Sign in to view your compute credits</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-amber-500/10">
            <CreditCard className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold" data-testid="text-page-title">Compute Credits</h1>
            <p className="text-sm text-muted-foreground">Manage compute credits and view transaction history. Gluon contribution credit is tracked separately and is not spendable here.</p>
          </div>
        </div>

        <Card className="p-6 bg-gradient-to-br from-amber-500/10 via-card/50 to-card/50 border-amber-500/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="relative">
            <p className="text-sm text-muted-foreground mb-1">Available Compute Credits</p>
            {userLoading ? (
              <Skeleton className="w-32 h-10" />
            ) : (
              <div className="flex items-center gap-2">
                <Zap className="w-8 h-8 text-amber-400 fill-amber-400" />
                <span className="text-4xl font-display font-bold text-amber-400" data-testid="text-balance">
                  {wallet?.balance ?? user?.energy ?? 0}
                </span>
                <span className="text-sm text-muted-foreground ml-1">credits</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="p-3 rounded-lg bg-white/[0.04]">
                <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-medium mb-1">
                  <ArrowUpRight className="w-3 h-3" /> Earned
                </div>
                <span className="text-lg font-bold font-mono" data-testid="text-earned">
                  {wallet?.totalEarned ?? 0}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-white/[0.04]">
                <div className="flex items-center gap-1.5 text-red-400 text-xs font-medium mb-1">
                  <ArrowDownRight className="w-3 h-3" /> Spent
                </div>
                <span className="text-lg font-bold font-mono" data-testid="text-spent">
                  {wallet?.totalSpent ?? 0}
                </span>
              </div>
            </div>
          </div>
        </Card>

        <div className="space-y-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            Transaction History
          </h2>
          {transactions.length === 0 ? (
            <Card className="p-8 bg-card/30 border-white/[0.04] text-center">
              <Coins className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No transactions yet</p>
            </Card>
          ) : (
            <div className="space-y-1.5">
              {transactions.map((tx: any) => {
                const isCredit = tx.type === "reward" || tx.type === "transfer_in" || tx.amount > 0;
                return (
                  <Card key={tx.id} className="p-3 bg-card/30 border-white/[0.04] flex items-center gap-3 hover:bg-card/50 transition-colors" data-testid={`tx-${tx.id}`}>
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                      isCredit ? "bg-emerald-500/10" : "bg-red-500/10"
                    )}>
                      {isCredit ? <ArrowUpRight className="w-4 h-4 text-emerald-400" /> : <ArrowDownRight className="w-4 h-4 text-red-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{tx.description || tx.type}</p>
                      <p className="text-xs text-muted-foreground">
                        {tx.createdAt ? formatDistanceToNow(new Date(tx.createdAt), { addSuffix: true }) : ""}
                      </p>
                    </div>
                    <div className={cn(
                      "font-mono font-semibold text-sm flex-shrink-0",
                      isCredit ? "text-emerald-400" : "text-red-400"
                    )}>
                      {isCredit ? "+" : ""}{tx.amount}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
