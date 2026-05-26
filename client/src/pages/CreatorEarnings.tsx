import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useLocation } from "wouter";
import { Bot, Lock, PackageCheck, Shield } from "lucide-react";

export default function CreatorEarnings() {
  const [, navigate] = useLocation();

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto space-y-6" data-testid="page-creator-tools">
        <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-br from-emerald-600/15 via-cyan-600/10 to-transparent p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <PackageCheck className="w-6 h-6 text-emerald-300" />
              </div>
              <div>
                <h1 className="text-2xl font-bold" data-testid="text-creator-tools-title">Creator Safe-Clone Tools</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Safe clone preparation is available now. Payments, payouts, and ownership transfer remain deferred.
                </p>
              </div>
            </div>
            <Badge className="bg-cyan-500/10 text-cyan-300 border-cyan-500/20">Sandbox-only MVP</Badge>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="glass-card rounded-xl border-white/[0.06]">
            <CardContent className="p-5 space-y-3">
              <Shield className="w-5 h-5 text-emerald-300" />
              <h2 className="font-semibold">Sanitized Listings</h2>
              <p className="text-sm text-muted-foreground">
                Prepare safe clone packages that exclude personal/private memory and require admin review.
              </p>
            </CardContent>
          </Card>
          <Card className="glass-card rounded-xl border-white/[0.06]">
            <CardContent className="p-5 space-y-3">
              <Bot className="w-5 h-5 text-cyan-300" />
              <h2 className="font-semibold">Sandbox Tests</h2>
              <p className="text-sm text-muted-foreground">
                Buyers can preview approved clones in a sandbox without production deployment or original memory access.
              </p>
            </CardContent>
          </Card>
          <Card className="glass-card rounded-xl border-white/[0.06]">
            <CardContent className="p-5 space-y-3">
              <Lock className="w-5 h-5 text-yellow-300" />
              <h2 className="font-semibold">Transactions Deferred</h2>
              <p className="text-sm text-muted-foreground">
                Checkout, payouts, paid transfers, and creator revenue flows are not enabled in this phase.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button onClick={() => navigate("/agent-marketplace/safe-clone")} className="bg-emerald-600 hover:bg-emerald-700">
            <PackageCheck className="w-4 h-4 mr-2" />
            Prepare Safe Clone
          </Button>
          <Button variant="outline" onClick={() => navigate("/agent-marketplace")} className="border-white/10">
            View Safe Clone Sandbox
          </Button>
        </div>
      </div>
    </Layout>
  );
}
