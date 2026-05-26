import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, ArrowLeft, CheckCircle2, EyeOff, Loader2, MessageSquare, PackageCheck, Shield, Star, XCircle } from "lucide-react";

function badgeClass(status: string) {
  if (["approved", "pending_review"].includes(status)) return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
  if (["rejected", "blocked"].includes(status)) return "bg-red-500/10 text-red-300 border-red-500/20";
  if (status === "sandbox_only") return "bg-cyan-500/10 text-cyan-300 border-cyan-500/20";
  return "bg-zinc-500/10 text-zinc-300 border-zinc-500/20";
}

function blockersFor(pkg: any) {
  return Array.isArray(pkg?.safetyReport?.blockers) ? pkg.safetyReport.blockers : [];
}

export default function MarketplaceCloneReview() {
  const [, navigate] = useLocation();
  const { admin, isLoading } = useAdminAuth();
  const queryClient = useQueryClient();
  const [reasonById, setReasonById] = useState<Record<string, string>>({});
  const isRootAdmin = admin?.actor?.type === "root_admin" && admin.role === "super_admin";

  useEffect(() => {
    if (!isLoading && !isRootAdmin) navigate("/admin/login", { replace: true });
  }, [isLoading, isRootAdmin, navigate]);

  const { data: packages = [], isLoading: packagesLoading } = useQuery({
    queryKey: ["/api/admin/marketplace-clones"],
    queryFn: () => api.adminMarketplaceClones.list(),
    enabled: isRootAdmin,
  });

  const { data: reviews = [], isLoading: reviewsLoading } = useQuery({
    queryKey: ["/api/admin/marketplace-reviews"],
    queryFn: () => api.adminMarketplaceReviews.list(),
    enabled: isRootAdmin,
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.adminMarketplaceClones.approve(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/marketplace-clones"] }),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => api.adminMarketplaceClones.reject(id, reasonById[id]),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/marketplace-clones"] }),
  });

  const moderateReviewMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "hide" | "reject" }) => {
      if (action === "approve") return api.adminMarketplaceReviews.approve(id);
      if (action === "hide") return api.adminMarketplaceReviews.hide(id);
      return api.adminMarketplaceReviews.reject(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/marketplace-reviews"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/marketplace-clones"] });
    },
  });

  if (isLoading || packagesLoading || reviewsLoading) {
    return (
      <div className="min-h-screen bg-[#070711] text-white flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isRootAdmin) return null;

  return (
    <div className="min-h-screen bg-[#070711] text-white">
      <div className="border-b border-white/[0.08] bg-[#0d0d18]/90">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <button onClick={() => navigate("/admin/dashboard")} className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-200">
            <ArrowLeft className="w-4 h-4" />
            Admin Dashboard
          </button>
          <Badge className="bg-emerald-500/10 text-emerald-300 border-emerald-500/20">Root admin only</Badge>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-br from-emerald-600/15 via-cyan-600/10 to-transparent p-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center">
              <PackageCheck className="w-5 h-5 text-emerald-300" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Marketplace Clone Review</h1>
              <p className="text-sm text-zinc-400 mt-1">Review sanitized safe-clone packages before they appear as sandbox-only listings. No checkout, creator earnings, ownership transfer, or production deployment is enabled.</p>
            </div>
          </div>
        </div>

        <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="w-5 h-5 text-cyan-300" />
            <h2 className="text-lg font-semibold">Sandbox Review Moderation</h2>
            <Badge className="ml-auto bg-cyan-500/10 text-cyan-300 border-cyan-500/20">No purchase required</Badge>
          </div>
          {reviews.length === 0 ? (
            <p className="text-sm text-zinc-500">No marketplace sandbox reviews have been submitted yet.</p>
          ) : (
            <div className="space-y-3">
              {reviews.map((review: any) => (
                <div key={review.id} className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-white">{review.title || "Sandbox review"}</h3>
                        <Badge className={badgeClass(review.moderationStatus)}>{review.moderationStatus}</Badge>
                        <Badge className="bg-cyan-500/10 text-cyan-300 border-cyan-500/20">sandbox-only</Badge>
                        {review.trustRanking?.label && (
                          <Badge className="bg-blue-500/10 text-blue-300 border-blue-500/20">
                            {review.trustRanking.label} · {review.trustRanking.score}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-amber-300">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star key={star} className={`w-3.5 h-3.5 ${star <= review.rating ? "fill-amber-300" : ""}`} />
                        ))}
                      </div>
                      <p className="text-sm text-zinc-300 max-w-3xl">{review.content}</p>
                      <p className="text-xs text-zinc-500">
                        Listing: {review.listing?.title || review.listingId} · Package: {review.clonePackage?.id || review.clonePackageId || "none"} · Reviewer: {review.reviewer?.displayName || "Sandbox tester"}
                      </p>
                      <div className="flex flex-wrap gap-2 text-xs text-zinc-500">
                        <span>Sanitized: {review.safetyReport?.sanitized ? "yes" : "no"}</span>
                        <span>Redactions: {Array.isArray(review.safetyReport?.redactions) ? review.safetyReport.redactions.length : 0}</span>
                        <span>Raw transcript exposed: {review.safetyReport?.rawSandboxTranscriptIncluded ? "yes" : "no"}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 lg:w-72 lg:justify-end">
                      <Button
                        onClick={() => moderateReviewMutation.mutate({ id: review.id, action: "approve" })}
                        disabled={review.moderationStatus === "approved" || moderateReviewMutation.isPending}
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700"
                      >
                        <CheckCircle2 className="w-4 h-4 mr-1" />
                        Approve
                      </Button>
                      <Button
                        onClick={() => moderateReviewMutation.mutate({ id: review.id, action: "hide" })}
                        disabled={review.moderationStatus === "hidden" || moderateReviewMutation.isPending}
                        size="sm"
                        variant="outline"
                        className="border-amber-500/20 text-amber-300 hover:bg-amber-500/10"
                      >
                        <EyeOff className="w-4 h-4 mr-1" />
                        Hide
                      </Button>
                      <Button
                        onClick={() => moderateReviewMutation.mutate({ id: review.id, action: "reject" })}
                        disabled={review.moderationStatus === "rejected" || moderateReviewMutation.isPending}
                        size="sm"
                        variant="outline"
                        className="border-red-500/20 text-red-300 hover:bg-red-500/10"
                      >
                        <XCircle className="w-4 h-4 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {packages.length === 0 ? (
          <Card className="bg-[#10101a]/90 border-white/[0.08] p-10 text-center">
            <Shield className="w-10 h-10 mx-auto text-zinc-600 mb-3" />
            <p className="text-zinc-400">No safe clone packages are waiting for review.</p>
          </Card>
        ) : (
          <div className="grid gap-4">
            {packages.map((pkg: any) => {
              const blockers = blockersFor(pkg);
              const canApprove = pkg.reviewStatus === "pending_review" && blockers.length === 0;
              const title = pkg.packageMetadata?.listing?.title || pkg.listing?.title || pkg.sourceAgent?.name || "Safe clone package";

              return (
                <Card key={pkg.id} className="bg-[#10101a]/90 border-white/[0.08] p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold">{title}</h2>
                        <Badge className={badgeClass(pkg.reviewStatus)}>{pkg.reviewStatus}</Badge>
                        <Badge className={badgeClass(pkg.status)}>{pkg.status}</Badge>
                        <Badge className="bg-zinc-500/10 text-zinc-300 border-zinc-500/20">{pkg.exportMode}</Badge>
                      </div>
                      <p className="text-sm text-zinc-500">
                        Creator: {pkg.creatorName} · Source: {pkg.sourceAgent?.name || "Unknown"} · Listing: {pkg.marketplaceListingId || "none"}
                      </p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                          <p className="text-xs text-zinc-500">Included</p>
                          <p className="text-lg font-semibold text-emerald-300">{pkg.includedVaultSummary?.total || 0}</p>
                        </div>
                        <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                          <p className="text-xs text-zinc-500">Excluded</p>
                          <p className="text-lg font-semibold text-cyan-300">{pkg.excludedVaultSummary?.total || 0}</p>
                        </div>
                        <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                          <p className="text-xs text-zinc-500">Redactions</p>
                          <p className="text-lg font-semibold text-yellow-300">{pkg.sanitizerReport?.redactions?.length || 0}</p>
                        </div>
                        <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                          <p className="text-xs text-zinc-500">Blockers</p>
                          <p className="text-lg font-semibold text-red-300">{blockers.length}</p>
                        </div>
                      </div>
                      {blockers.length > 0 ? (
                        <div className="space-y-2">
                          {blockers.map((blocker: any, index: number) => (
                            <div key={`${blocker.code}-${index}`} className="flex items-start gap-2 text-sm text-red-300">
                              <AlertTriangle className="w-4 h-4 mt-0.5" />
                              <span>{blocker.message}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex items-start gap-2 text-sm text-emerald-300">
                          <CheckCircle2 className="w-4 h-4 mt-0.5" />
                          No blocking memory export issue detected.
                        </div>
                      )}
                    </div>

                    <div className="w-full lg:w-72 space-y-3">
                      <Textarea
                        value={reasonById[pkg.id] || ""}
                        onChange={(event) => setReasonById((current) => ({ ...current, [pkg.id]: event.target.value }))}
                        placeholder="Optional rejection reason"
                        className="min-h-20 bg-white/[0.04] border-white/[0.08] text-white"
                      />
                      <div className="flex gap-2">
                        <Button
                          onClick={() => approveMutation.mutate(pkg.id)}
                          disabled={!canApprove || approveMutation.isPending}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                        >
                          {approveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                          Approve
                        </Button>
                        <Button
                          onClick={() => rejectMutation.mutate(pkg.id)}
                          disabled={pkg.reviewStatus === "rejected" || rejectMutation.isPending}
                          variant="outline"
                          className="flex-1 border-red-500/20 text-red-300 hover:bg-red-500/10"
                        >
                          {rejectMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <XCircle className="w-4 h-4 mr-2" />}
                          Reject
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
