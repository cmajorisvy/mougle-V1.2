import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, type AdminStaff, type AdminStaffCreatePayload, type AdminStaffRole, type AdminStaffUpdatePayload } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Check, Edit, Loader2, Plus, RotateCcw, ShieldCheck, Users, X, Power } from "lucide-react";

type StaffFormState = {
  email: string;
  username: string;
  displayName: string;
  password: string;
  role: AdminStaffRole;
  permissions: string;
  // T298 — Optional Slack handle so the shared-preview banner can offer a
  // "Slack <name>" DM button for teammates who live in Slack.
  slackHandle: string;
};

const staffRoleOptions: { value: AdminStaffRole; label: string }[] = [
  { value: "support", label: "Support" },
  { value: "staff", label: "Staff" },
  { value: "moderator", label: "Moderator" },
  { value: "content", label: "Content" },
  { value: "finance", label: "Finance" },
  { value: "ai_operator", label: "AI Operator" },
  { value: "admin", label: "Admin" },
];

const emptyForm: StaffFormState = {
  email: "",
  username: "",
  displayName: "",
  password: "",
  role: "support",
  permissions: "",
  slackHandle: "",
};

function parsePermissions(value: string) {
  return value
    .split(",")
    .map((permission) => permission.trim())
    .filter(Boolean);
}

function formatDate(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

function StaffBadge({ active }: { active: boolean }) {
  return (
    <span className={`px-2 py-1 rounded-md text-[11px] font-medium ${active ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}>
      {active ? "Active" : "Disabled"}
    </span>
  );
}

export default function StaffManagement() {
  const [, navigate] = useLocation();
  const { isLoading: authLoading, isAuthenticated } = useAdminAuth({ requiredPermission: "staff:manage" });
  const [form, setForm] = useState<StaffFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<StaffFormState>(emptyForm);
  const [error, setError] = useState("");

  const { data: staff = [], isLoading } = useQuery({
    queryKey: ["admin-staff"],
    queryFn: () => api.admin.staff(),
    enabled: isAuthenticated,
  });

  const createMutation = useMutation({
    mutationFn: (data: AdminStaffCreatePayload) => api.admin.createStaff(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-staff"] });
      setForm(emptyForm);
      setError("");
    },
    onError: (err: any) => setError(err.message || "Unable to create staff member"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: AdminStaffUpdatePayload }) => api.admin.updateStaff(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-staff"] });
      setEditingId(null);
      setEditForm(emptyForm);
      setError("");
    },
    onError: (err: any) => setError(err.message || "Unable to update staff member"),
  });

  const disableMutation = useMutation({
    mutationFn: (id: string) => api.admin.disableStaff(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-staff"] });
      setError("");
    },
    onError: (err: any) => setError(err.message || "Unable to disable staff member"),
  });

  const enableMutation = useMutation({
    mutationFn: (id: string) => api.admin.enableStaff(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-staff"] });
      setError("");
    },
    onError: (err: any) => setError(err.message || "Unable to enable staff member"),
  });

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#060611] flex items-center justify-center text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading...
      </div>
    );
  }
  if (!isAuthenticated) return null;

  const createStaff = () => {
    createMutation.mutate({
      email: form.email,
      username: form.username,
      displayName: form.displayName,
      password: form.password,
      role: form.role,
      permissions: parsePermissions(form.permissions),
      active: true,
      // T298 — Only send a non-empty Slack handle so the API skips persistence
      // when admins leave the field blank.
      ...(form.slackHandle.trim() ? { slackHandle: form.slackHandle.trim() } : {}),
    });
  };

  const startEditing = (member: AdminStaff) => {
    setEditingId(member.id);
    setEditForm({
      email: member.email,
      username: member.username,
      displayName: member.displayName,
      password: "",
      role: member.role,
      permissions: member.permissions.join(", "),
      slackHandle: member.slackHandle ?? "",
    });
  };

  const saveStaff = (id: string) => {
    const data: AdminStaffUpdatePayload = {
      email: editForm.email,
      username: editForm.username,
      displayName: editForm.displayName,
      role: editForm.role,
      permissions: parsePermissions(editForm.permissions),
      // T298 — Always send the current value (empty string clears the handle
      // server-side, non-empty stores the trimmed form).
      slackHandle: editForm.slackHandle.trim(),
    };
    if (editForm.password) data.password = editForm.password;
    updateMutation.mutate({ id, data });
  };

  return (
    <div className="min-h-screen bg-[#060611] text-white">
      <header className="sticky top-0 z-40 bg-gray-950/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="h-9 w-9 p-0 text-gray-400 hover:text-white" onClick={() => navigate("/admin/dashboard")}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="w-9 h-9 rounded-lg bg-indigo-500/15 text-indigo-300 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold" data-testid="text-staff-management-title">Staff Management</h1>
              <p className="text-[11px] text-gray-500">Internal admin and employee access</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {error && (
          <Card className="bg-red-500/10 border-red-500/20 text-red-300 p-3 text-sm" data-testid="text-staff-error">
            {error}
          </Card>
        )}

        <Card className="bg-gray-900/70 border-gray-800/60 p-4 rounded-lg">
          <div className="flex items-center gap-2 mb-4">
            <Plus className="w-4 h-4 text-indigo-300" />
            <h2 className="text-sm font-semibold">Create Staff Account</h2>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs text-gray-500">Display Name</Label>
              <Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} className="bg-gray-800/60 border-gray-700/60 text-white" />
            </div>
            <div>
              <Label className="text-xs text-gray-500">Username</Label>
              <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="bg-gray-800/60 border-gray-700/60 text-white" />
            </div>
            <div>
              <Label className="text-xs text-gray-500">Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="bg-gray-800/60 border-gray-700/60 text-white" />
            </div>
            <div>
              <Label className="text-xs text-gray-500">Temporary Password</Label>
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="bg-gray-800/60 border-gray-700/60 text-white" />
            </div>
            <div>
              <Label className="text-xs text-gray-500">Role</Label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as StaffFormState["role"] })} className="w-full h-10 bg-gray-800/60 border border-gray-700/60 text-white rounded-md px-3 text-sm">
                {staffRoleOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs text-gray-500">Permissions</Label>
              <Input placeholder="staff:manage, support:manage" value={form.permissions} onChange={(e) => setForm({ ...form, permissions: e.target.value })} className="bg-gray-800/60 border-gray-700/60 text-white" />
            </div>
            <div>
              <Label className="text-xs text-gray-500">Slack Handle (optional)</Label>
              <Input
                placeholder="@jane or U0123ABC"
                value={form.slackHandle}
                onChange={(e) => setForm({ ...form, slackHandle: e.target.value })}
                className="bg-gray-800/60 border-gray-700/60 text-white"
                data-testid="input-staff-slack-handle"
              />
              <p className="text-[10px] text-gray-600 mt-1">Used by the shared-preview banner's "Slack &lt;name&gt;" button.</p>
            </div>
          </div>
          <Button onClick={createStaff} disabled={createMutation.isPending} className="mt-4 bg-indigo-600 hover:bg-indigo-700" data-testid="button-create-staff">
            {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
            Create Staff
          </Button>
        </Card>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2"><Users className="w-4 h-4 text-indigo-300" /> Staff Accounts</h2>
            <span className="text-xs text-gray-500">{staff.length} accounts</span>
          </div>

          {isLoading ? (
            <div className="py-12 text-center text-gray-500"><Loader2 className="w-6 h-6 animate-spin inline mr-2" /> Loading staff...</div>
          ) : staff.length === 0 ? (
            <Card className="bg-gray-900/70 border-gray-800/60 p-6 text-center text-gray-500">No staff accounts yet</Card>
          ) : (
            staff.map((member) => {
              const editing = editingId === member.id;
              return (
                <Card key={member.id} className="bg-gray-900/70 border-gray-800/60 p-4 rounded-lg" data-testid={`card-staff-${member.id}`}>
                  <div className="flex flex-col lg:flex-row lg:items-center gap-4 justify-between">
                    <div className="min-w-0 flex-1">
                      {editing ? (
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                          <Input value={editForm.displayName} onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })} className="bg-gray-800/60 border-gray-700/60 text-white" />
                          <Input value={editForm.username} onChange={(e) => setEditForm({ ...editForm, username: e.target.value })} className="bg-gray-800/60 border-gray-700/60 text-white" />
                          <Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className="bg-gray-800/60 border-gray-700/60 text-white" />
                          <Input type="password" placeholder="New password optional" value={editForm.password} onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} className="bg-gray-800/60 border-gray-700/60 text-white" />
                          <select value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value as StaffFormState["role"] })} className="w-full h-10 bg-gray-800/60 border border-gray-700/60 text-white rounded-md px-3 text-sm">
                            {staffRoleOptions.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                          <Input value={editForm.permissions} onChange={(e) => setEditForm({ ...editForm, permissions: e.target.value })} className="bg-gray-800/60 border-gray-700/60 text-white" />
                          <Input
                            placeholder="Slack handle (e.g. @jane)"
                            value={editForm.slackHandle}
                            onChange={(e) => setEditForm({ ...editForm, slackHandle: e.target.value })}
                            className="bg-gray-800/60 border-gray-700/60 text-white"
                            data-testid={`input-edit-staff-slack-handle-${member.id}`}
                          />
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-white">{member.displayName}</p>
                            <StaffBadge active={member.active} />
                            <span className="px-2 py-1 rounded-md text-[11px] font-medium bg-indigo-500/10 text-indigo-300">{member.role}</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">@{member.username} · {member.email}</p>
                          {member.slackHandle && (
                            <p className="text-xs text-gray-600 mt-1" data-testid={`text-staff-slack-${member.id}`}>
                              Slack: {member.slackHandle}
                            </p>
                          )}
                          <p className="text-xs text-gray-600 mt-1">Last login: {formatDate(member.lastLoginAt)}</p>
                          <div className="flex gap-1 flex-wrap mt-2">
                            {member.permissions.length === 0 ? (
                              <span className="text-[11px] text-gray-600">No scoped permissions</span>
                            ) : member.permissions.map((permission) => (
                              <span key={permission} className="px-2 py-1 rounded bg-gray-800 text-[11px] text-gray-400">{permission}</span>
                            ))}
                          </div>
                        </>
                      )}
                    </div>

                    <div className="flex gap-2 flex-wrap">
                      {editing ? (
                        <>
                          <Button size="sm" onClick={() => saveStaff(member.id)} disabled={updateMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700">
                            {updateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Check className="w-3.5 h-3.5 mr-1" />}
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setEditForm(emptyForm); }}>
                            <X className="w-3.5 h-3.5 mr-1" /> Cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button size="sm" variant="ghost" className="text-gray-400 hover:text-white" onClick={() => startEditing(member)}>
                            <Edit className="w-3.5 h-3.5 mr-1" /> Edit
                          </Button>
                          {member.active ? (
                            <Button size="sm" variant="ghost" className="text-red-300 hover:text-red-200" onClick={() => disableMutation.mutate(member.id)} disabled={disableMutation.isPending}>
                              <Power className="w-3.5 h-3.5 mr-1" /> Disable
                            </Button>
                          ) : (
                            <Button size="sm" variant="ghost" className="text-emerald-300 hover:text-emerald-200" onClick={() => enableMutation.mutate(member.id)} disabled={enableMutation.isPending}>
                              <RotateCcw className="w-3.5 h-3.5 mr-1" /> Enable
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}
