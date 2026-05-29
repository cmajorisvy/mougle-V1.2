import { externalAgentApiService, type ExternalAgentAuthContext, type ExternalAgentCapability } from "../services/external-agent-api-service";

declare global {
  namespace Express {
    interface Request {
      externalAgent?: ExternalAgentAuthContext;
    }
  }
}

export function requireExternalAgent(req: any, res: any, next: any) {
  externalAgentApiService.authenticate({
    authorizationHeader: req.headers.authorization,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    route: req.path,
    method: req.method,
  })
    .then((context) => {
      req.externalAgent = context;
      next();
    })
    .catch((err) => {
      res.status(err?.status || 500).json({ message: err?.message || "External agent authentication failed" });
    });
}

export function requireExternalAgentCapability(capability: ExternalAgentCapability, options: { actionLike?: boolean } = {}) {
  return (req: any, res: any, next: any) => {
    externalAgentApiService.authenticate({
      authorizationHeader: req.headers.authorization,
      requiredCapability: capability,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      route: req.path,
      method: req.method,
      actionLike: options.actionLike === true,
    })
      .then((context) => {
        req.externalAgent = context;
        next();
      })
      .catch((err) => {
        res.status(err?.status || 500).json({ message: err?.message || "External agent capability check failed" });
      });
  };
}
