const ROOT_ADMIN_ROLE = "super_admin";
const ROOT_ADMIN_ACTOR_ID = "env-root-admin";
const ROOT_ADMIN_PERMISSIONS = ["*"];

export function getAdminVerification(req: any) {
  if (!req.session?.isAdmin) {
    return null;
  }

  const actorType = req.session.adminActorType || "root_admin";

  return {
    valid: true,
    role: req.session.adminRole || ROOT_ADMIN_ROLE,
    permissions: req.session.adminPermissions || (actorType === "staff" ? [] : ROOT_ADMIN_PERMISSIONS),
    actor: {
      id: req.session.adminActorId || ROOT_ADMIN_ACTOR_ID,
      type: actorType,
    },
  };
}

export function isRootAdmin(admin: ReturnType<typeof getAdminVerification>) {
  return !!admin && admin.actor.type === "root_admin" && admin.role === ROOT_ADMIN_ROLE;
}

export function requireAdmin(req: any, res: any, next: any) {
  if (!getAdminVerification(req)) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

export function requireRootAdmin(req: any, res: any, next: any) {
  const admin = getAdminVerification(req);
  if (!admin) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (!isRootAdmin(admin)) {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
}

export function requireAdminPermission(permission: string) {
  return requireAnyAdminPermission([permission]);
}

export function requireAnyAdminPermission(permissions: readonly string[]) {
  return (req: any, res: any, next: any) => {
    const admin = getAdminVerification(req);
    if (!admin) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!admin.permissions.includes("*") && !permissions.some((permission) => admin.permissions.includes(permission))) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };
}

export const ADMIN_AUTH_CONSTANTS = {
  ROOT_ADMIN_ROLE,
  ROOT_ADMIN_ACTOR_ID,
  ROOT_ADMIN_PERMISSIONS,
};
