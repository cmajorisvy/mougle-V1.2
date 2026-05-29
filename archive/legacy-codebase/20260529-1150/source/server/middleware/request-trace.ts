import crypto from "crypto";

export function requestTrace(req: any, _res: any, next: any) {
  req.traceId = req.headers["x-trace-id"] || `trace_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  _res.setHeader("x-trace-id", req.traceId);
  req.traceStart = Date.now();
  next();
}
