import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { api, type AdminAccessType, type AdminStaffRole } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle, Clock, Loader2, Lock, ShieldCheck } from "lucide-react";

type FormState = {
  fullName: string;
  email: string;
  username: string;
  requestedAccessType: AdminAccessType;
  requestedRole: AdminStaffRole;
  reason: string;
  password: string;
  confirmPassword: string;
};

const initialForm: FormState = {
  fullName: "",
  email: "",
  username: "",
  requestedAccessType: "staff_admin",
  requestedRole: "support",
  reason: "",
  password: "",
  confirmPassword: "",
};

const staffRoles: { value: AdminStaffRole; label: string }[] = [
  { value: "support", label: "Support" },
  { value: "moderator", label: "Moderator" },
  { value: "content", label: "Content / News" },
  { value: "finance", label: "Finance" },
  { value: "ai_operator", label: "AI Operator" },
  { value: "staff", label: "General Staff" },
];

function roleOptions(accessType: AdminAccessType) {
  if (accessType === "main_admin") return [{ value: "admin" as const, label: "Admin" }];
  return staffRoles;
}

export default function AdminAccessRequest() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [error, setError] = useState("");

  useEffect(() => {
    const options = roleOptions(form.requestedAccessType);
    if (!options.some((option) => option.value === form.requestedRole)) {
      setForm((current) => ({ ...current, requestedRole: options[0].value }));
    }
  }, [form.requestedAccessType, form.requestedRole]);

  const requestMutation = useMutation({
    mutationFn: () => api.admin.requestAccess(form),
    onSuccess: () => {
      setError("");
      setForm(initialForm);
    },
    onError: (err: any) => setError(err.message || "Unable to submit access request"),
  });

  const submit = () => {
    setError("");
    requestMutation.mutate();
  };

  const submitted = requestMutation.isSuccess;
  const options = roleOptions(form.requestedAccessType);

  return (
    <div className="min-h-screen bg-[#060611] text-white flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(120,50,255,0.14),transparent_58%)]" />
      <div className="w-full max-w-3xl relative z-10 space-y-6">
        <div className="text-center space-y-3">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-500/15 text-purple-200 border border-purple-400/20">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Request Mougle Internal Access</h1>
            <p className="text-sm text-gray-500 mt-2">Requests stay pending until approved by a Mougle owner review link.</p>
          </div>
        </div>

        <Card className="bg-gray-900/70 border-white/[0.08] p-6 rounded-xl shadow-2xl shadow-purple-950/20">
          {submitted ? (
            <div className="py-10 text-center space-y-4" data-testid="admin-access-request-success">
              <CheckCircle className="w-12 h-12 text-emerald-300 mx-auto" />
              <div>
                <h2 className="text-xl font-semibold text-white">Request submitted</h2>
                <p className="text-sm text-gray-400 mt-2 max-w-lg mx-auto">
                  Your account is still pending. The Mougle owner emails have received approval and rejection links, and access remains blocked until one owner approves it.
                </p>
              </div>
              <Button asChild className="bg-purple-600 hover:bg-purple-700">
                <Link href="/admin/login">Back to Admin Login</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-5">
              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-red-300 text-sm flex items-center gap-2" data-testid="admin-access-request-error">
                  <Lock className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName" className="text-gray-300 text-sm">Full name</Label>
                  <Input id="fullName" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="bg-gray-800/60 border-gray-700/60 text-white" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-gray-300 text-sm">Email</Label>
                  <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="bg-gray-800/60 border-gray-700/60 text-white" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="username" className="text-gray-300 text-sm">Username</Label>
                  <Input id="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="bg-gray-800/60 border-gray-700/60 text-white" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="requestedAccessType" className="text-gray-300 text-sm">Access type</Label>
                  <select
                    id="requestedAccessType"
                    value={form.requestedAccessType}
                    onChange={(e) => setForm({ ...form, requestedAccessType: e.target.value as AdminAccessType })}
                    className="w-full h-10 bg-gray-800/60 border border-gray-700/60 text-white rounded-md px-3 text-sm"
                  >
                    <option value="staff_admin">Staff Admin / Staff Dashboard</option>
                    <option value="main_admin">Main Admin / Admin Control Center</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="requestedRole" className="text-gray-300 text-sm">Requested role</Label>
                  <select
                    id="requestedRole"
                    value={form.requestedRole}
                    onChange={(e) => setForm({ ...form, requestedRole: e.target.value as AdminStaffRole })}
                    className="w-full h-10 bg-gray-800/60 border border-gray-700/60 text-white rounded-md px-3 text-sm"
                  >
                    {options.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-300 text-sm">Approval status</Label>
                  <div className="h-10 rounded-md bg-gray-800/40 border border-gray-700/50 flex items-center px-3 text-sm text-gray-400">
                    <Clock className="w-4 h-4 mr-2 text-amber-300" />
                    Pending owner review
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reason" className="text-gray-300 text-sm">Reason / message</Label>
                <Textarea
                  id="reason"
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  className="bg-gray-800/60 border-gray-700/60 text-white min-h-28"
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-gray-300 text-sm">Password</Label>
                  <Input id="password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="bg-gray-800/60 border-gray-700/60 text-white" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-gray-300 text-sm">Confirm password</Label>
                  <Input id="confirmPassword" type="password" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} className="bg-gray-800/60 border-gray-700/60 text-white" />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between pt-2">
                <p className="text-xs text-gray-500">No admin or staff session is created by this request.</p>
                <Button onClick={submit} disabled={requestMutation.isPending} className="bg-purple-600 hover:bg-purple-700" data-testid="button-submit-admin-access-request">
                  {requestMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                  Submit Request
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
