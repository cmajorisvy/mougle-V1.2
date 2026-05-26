import { Layout } from "@/components/layout/Layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useState } from "react";
import {
  FileText, CheckCircle2, AlertCircle, Shield, Building2, Mail,
  MapPin, Globe, Phone, User, Briefcase, ScrollText, ArrowRight
} from "lucide-react";

const BUSINESS_TYPES = [
  { value: "individual", label: "Individual Creator" },
  { value: "sole_proprietor", label: "Sole Proprietorship" },
  { value: "partnership", label: "Partnership" },
  { value: "llp", label: "LLP" },
  { value: "private_limited", label: "Private Limited Company" },
  { value: "public_limited", label: "Public Limited Company" },
  { value: "ngo", label: "Non-Profit / NGO" },
];

function ProfileForm({ userId, existingProfile, onComplete }: { userId: string; existingProfile?: any; onComplete: () => void }) {
  const [form, setForm] = useState({
    publisherName: existingProfile?.publisherName || "",
    companyName: existingProfile?.companyName || "",
    businessType: existingProfile?.businessType || "individual",
    address: existingProfile?.address || "",
    city: existingProfile?.city || "",
    state: existingProfile?.state || "",
    country: existingProfile?.country || "India",
    postalCode: existingProfile?.postalCode || "",
    supportEmail: existingProfile?.supportEmail || "",
    supportPhone: existingProfile?.supportPhone || "",
    websiteUrl: existingProfile?.websiteUrl || "",
  });
  const queryClient = useQueryClient();

  const save = useMutation({
    mutationFn: () => api.publisher.saveProfile({ userId, ...form }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/publisher/profile"] });
      onComplete();
    },
  });

  const updateField = (field: string, value: string) => setForm(f => ({ ...f, [field]: value }));
  const isValid = form.publisherName && form.supportEmail && form.address && form.businessType;

  return (
    <Card className="glass-card rounded-xl" data-testid="section-publisher-form">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-primary" />
          Publisher Details
        </CardTitle>
        <p className="text-sm text-muted-foreground">Your identity will be displayed on every app you publish.</p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Publisher Name *</label>
            <Input data-testid="input-publisher-name" placeholder="Your name or brand" value={form.publisherName} onChange={e => updateField("publisherName", e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Company Name</label>
            <Input data-testid="input-company-name" placeholder="Company (optional)" value={form.companyName} onChange={e => updateField("companyName", e.target.value)} />
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Business Type *</label>
          <select
            data-testid="select-business-type"
            className="w-full h-10 rounded-md border border-white/[0.08] bg-background px-3 text-sm"
            value={form.businessType}
            onChange={e => updateField("businessType", e.target.value)}
          >
            {BUSINESS_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Address *</label>
          <Input data-testid="input-address" placeholder="Full business address" value={form.address} onChange={e => updateField("address", e.target.value)} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">City</label>
            <Input data-testid="input-city" placeholder="City" value={form.city} onChange={e => updateField("city", e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">State</label>
            <Input data-testid="input-state" placeholder="State" value={form.state} onChange={e => updateField("state", e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Country</label>
            <Input data-testid="input-country" placeholder="Country" value={form.country} onChange={e => updateField("country", e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Postal Code</label>
            <Input data-testid="input-postal-code" placeholder="PIN" value={form.postalCode} onChange={e => updateField("postalCode", e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Support Email *</label>
            <Input data-testid="input-support-email" type="email" placeholder="support@example.com" value={form.supportEmail} onChange={e => updateField("supportEmail", e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Support Phone</label>
            <Input data-testid="input-support-phone" placeholder="+91 9876543210" value={form.supportPhone} onChange={e => updateField("supportPhone", e.target.value)} />
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Website</label>
          <Input data-testid="input-website" placeholder="https://yourwebsite.com" value={form.websiteUrl} onChange={e => updateField("websiteUrl", e.target.value)} />
        </div>

        <Button
          data-testid="button-save-profile"
          className="w-full"
          onClick={() => save.mutate()}
          disabled={save.isPending || !isValid}
        >
          {save.isPending ? "Saving..." : existingProfile ? "Update Publisher Profile" : "Create Publisher Profile"}
        </Button>
        {save.isError && (
          <div className="text-xs text-red-400 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> {(save.error as Error).message}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AgreementSection({ userId, profile, onAccepted }: { userId: string; profile: any; onAccepted: () => void }) {
  const queryClient = useQueryClient();
  const { data: agreement } = useQuery({
    queryKey: ["/api/publisher/agreement"],
    queryFn: () => api.publisher.getAgreement(),
  });

  const accept = useMutation({
    mutationFn: () => api.publisher.acceptAgreement(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/publisher/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/publisher/can-publish"] });
      onAccepted();
    },
  });

  const alreadyAccepted = profile?.agreementVersion === agreement?.version;

  return (
    <Card className="glass-card rounded-xl" data-testid="section-agreement">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScrollText className="w-5 h-5 text-primary" />
          Creator Publisher Agreement
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-h-72 overflow-y-auto p-4 rounded-lg bg-white/[0.02] border border-white/[0.06] text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed" data-testid="text-agreement">
          {agreement?.text || "Loading agreement..."}
        </div>

        {alreadyAccepted ? (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/15 text-emerald-400 text-sm">
            <CheckCircle2 className="w-4 h-4" />
            Agreement accepted (v{profile.agreementVersion}) on {new Date(profile.agreementAcceptedAt).toLocaleDateString("en-IN")}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              By clicking below, you acknowledge that you have read, understood, and agree to the Creator Publisher Agreement. You accept full responsibility for any applications you publish on Mougle Labs.
            </div>
            <Button
              data-testid="button-accept-agreement"
              className="w-full"
              onClick={() => accept.mutate()}
              disabled={accept.isPending}
            >
              {accept.isPending ? "Processing..." : "I Accept — Sign Publisher Agreement"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function PublisherResponsibility() {
  const userId = "current-user";
  const queryClient = useQueryClient();

  const { data: profileData, isLoading: profileLoading } = useQuery({
    queryKey: ["/api/publisher/profile", userId],
    queryFn: () => api.publisher.getProfile(userId),
  });

  const { data: publishCheck } = useQuery({
    queryKey: ["/api/publisher/can-publish", userId],
    queryFn: () => api.publisher.canPublish(userId),
    enabled: !!profileData?.profile,
  });

  const profile = profileData?.profile;

  if (profileLoading) {
    return (
      <Layout>
        <div className="p-6 space-y-6 max-w-4xl mx-auto">
          <Skeleton className="h-10 w-60" />
          <Skeleton className="h-64" />
        </div>
      </Layout>
    );
  }

  const step = !profile ? 1 : !profile.agreementVersion ? 2 : 3;

  return (
    <Layout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <FileText className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-publisher-title">Publisher Responsibility</h1>
              <p className="text-sm text-muted-foreground">Manage your publisher identity and legal obligations</p>
            </div>
          </div>
          <Badge className={cn("px-3 py-1",
            publishCheck?.allowed
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
              : "bg-amber-500/10 text-amber-400 border-amber-500/20"
          )} data-testid="badge-publish-status">
            {publishCheck?.allowed ? "Ready to Publish" : "Setup Required"}
          </Badge>
        </div>

        <div className="flex items-center gap-4 py-2" data-testid="section-steps">
          {[
            { n: 1, label: "Publisher Profile" },
            { n: 2, label: "Accept Agreement" },
            { n: 3, label: "Ready to Publish" },
          ].map((s, i) => (
            <div key={s.n} className="flex items-center gap-2">
              {i > 0 && <ArrowRight className="w-4 h-4 text-muted-foreground/30" />}
              <div className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border",
                step > s.n ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/15" :
                step === s.n ? "bg-primary/10 text-primary border-primary/20" :
                "bg-white/[0.03] text-muted-foreground border-white/[0.06]"
              )}>
                {step > s.n ? <CheckCircle2 className="w-3.5 h-3.5" /> : <span className="w-4 text-center">{s.n}</span>}
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {(step === 1 || step >= 3) && (
          <ProfileForm
            userId={userId}
            existingProfile={profile}
            onComplete={() => queryClient.invalidateQueries({ queryKey: ["/api/publisher/profile"] })}
          />
        )}

        {step >= 2 && profile && (
          <AgreementSection
            userId={userId}
            profile={profile}
            onAccepted={() => queryClient.invalidateQueries({ queryKey: ["/api/publisher/can-publish"] })}
          />
        )}

        {step >= 3 && publishCheck?.allowed && (
          <Card className="glass-card rounded-xl border-emerald-500/15 bg-emerald-500/5" data-testid="section-ready">
            <CardContent className="p-6 text-center space-y-3">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
              <h3 className="text-lg font-bold">You're Ready to Publish</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Your publisher profile is complete and the agreement is signed. You can now publish applications on Mougle Labs.
              </p>
            </CardContent>
          </Card>
        )}

        <Card className="glass-card rounded-xl" data-testid="section-platform-notice">
          <CardHeader>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              Platform Infrastructure Disclaimer
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="p-4 rounded-lg bg-white/[0.02] border border-white/[0.06] text-xs text-muted-foreground leading-relaxed">
              Mougle is a technology platform that provides infrastructure, tools, and distribution services for creators to build and publish applications. Mougle does not operate published applications and bears no responsibility for application-specific outcomes, decisions, data handling, or content. Each published application is independently operated by its creator/publisher, who is solely responsible for its functionality, legal compliance, and user support. For app-specific issues, users should contact the publisher directly using the information displayed on the app page.
            </div>
          </CardContent>
        </Card>

        {profile && (
          <Card className="glass-card rounded-xl" data-testid="section-profile-summary">
            <CardHeader>
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <User className="w-4 h-4 text-primary" />
                Your Publisher Identity (as displayed on apps)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { icon: User, label: "Publisher", value: profile.publisherName },
                  { icon: Building2, label: "Company", value: profile.companyName || "—" },
                  { icon: Briefcase, label: "Business Type", value: BUSINESS_TYPES.find(t => t.value === profile.businessType)?.label || profile.businessType },
                  { icon: Mail, label: "Support Email", value: profile.supportEmail },
                  { icon: Phone, label: "Phone", value: profile.supportPhone || "—" },
                  { icon: MapPin, label: "Location", value: [profile.city, profile.state, profile.country].filter(Boolean).join(", ") || "—" },
                  { icon: Globe, label: "Website", value: profile.websiteUrl || "—" },
                  { icon: ScrollText, label: "Agreement", value: profile.agreementVersion ? `v${profile.agreementVersion} accepted` : "Not accepted" },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                    <item.icon className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-[10px] text-muted-foreground">{item.label}</div>
                      <div className="text-sm font-medium">{item.value}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
