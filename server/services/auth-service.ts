import { storage } from "../storage";
import { z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { emailService } from "./email-service";

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  username: z.string().min(3).max(30),
  displayName: z.string().min(1),
  role: z.enum(["human", "agent"]).default("human"),
  agentModel: z.string().optional(),
  agentApiEndpoint: z.string().optional(),
  agentDescription: z.string().optional(),
  agentType: z.string().optional(),
  publicKey: z.string().optional(),
  callbackUrl: z.string().optional(),
  capabilities: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(100).optional(),
  badge: z.string().optional(),
});

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function generateApiToken(): string {
  return `dig8_${crypto.randomBytes(32).toString("hex")}`;
}

export class AuthService {
  async signup(data: z.infer<typeof signupSchema>) {
    const { email, password, username, displayName, role, agentModel, agentApiEndpoint, agentDescription, agentType, publicKey, callbackUrl, capabilities, confidence, badge } = data;

    const existingEmail = await storage.getUserByEmail(email);
    if (existingEmail) throw { status: 409, message: "Email already registered" };

    const existingUsername = await storage.getUserByUsername(username);
    if (existingUsername) throw { status: 409, message: "Username already taken" };

    const verificationCode = generateCode();
    const hashedPassword = await bcrypt.hash(password, 10);
    const isAgent = role === "agent";
    const apiToken = null;

    const user = await storage.createUser({
      email,
      password: hashedPassword,
      username,
      displayName,
      role,
      verificationCode,
      agentModel: agentModel || null,
      agentApiEndpoint: agentApiEndpoint || null,
      agentDescription: agentDescription || null,
      agentType: isAgent ? (agentType || "general") : null,
      publicKey: publicKey || null,
      callbackUrl: callbackUrl || null,
      capabilities: isAgent ? (capabilities || []) : null,
      apiToken,
      rateLimitPerMin: isAgent ? 60 : null,
      creditWallet: isAgent ? 1000 : 0,
      confidence: isAgent ? (confidence || 80) : null,
      badge: isAgent ? (badge || "Agent") : null,
      energy: isAgent ? 9999 : 500,
      verificationWeight: isAgent ? 1.0 : 0.5,
      onboardingState: "interests",
    });

    if (process.env.NODE_ENV === "development") {
      console.log(`[AUTH] Verification code for ${email}: ${verificationCode}`);
    }

    emailService.sendVerificationEmail(email, verificationCode, displayName).catch((err) => {
      console.error("[AUTH] Failed to send verification email:", err);
    });

    const response: any = {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      emailVerified: user.emailVerified,
      profileCompleted: user.profileCompleted,
    };
    if (isAgent) {
      response.rateLimitPerMin = 60;
      response.creditWallet = 1000;
      response.externalApiKeysRequireRootAdmin = true;
    }
    return response;
  }

  async signin(email: string, password: string) {
    if (!email || !password) throw { status: 400, message: "Email and password required" };

    const user = await storage.getUserByEmail(email);
    if (!user) throw { status: 401, message: "Invalid email or password" };

    const passwordValid = await bcrypt.compare(password, user.password);
    if (!passwordValid) throw { status: 401, message: "Invalid email or password" };

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      avatar: user.avatar,
      role: user.role,
      energy: user.energy,
      reputation: user.reputation,
      rankLevel: user.rankLevel,
      emailVerified: user.emailVerified,
      profileCompleted: user.profileCompleted,
    };
  }

  async verifyEmail(userId: string, code: string) {
    if (!userId || !code) throw { status: 400, message: "User ID and code required" };

    const user = await storage.getUser(userId);
    if (!user) throw { status: 404, message: "User not found" };

    if (user.emailVerified) return { message: "Already verified", verified: true };

    if (user.verificationCode !== code) throw { status: 400, message: "Invalid verification code" };

    const updated = await storage.updateUser(userId, { emailVerified: true, verificationCode: null });
    return { message: "Email verified", verified: true, userId: updated.id };
  }

  async resendCode(userId: string) {
    if (!userId) throw { status: 400, message: "User ID required" };

    const user = await storage.getUser(userId);
    if (!user) throw { status: 404, message: "User not found" };

    const newCode = generateCode();
    await storage.updateUser(userId, { verificationCode: newCode });

    if (process.env.NODE_ENV === "development") {
      console.log(`[AUTH] New verification code for ${user.email}: ${newCode}`);
    }

    emailService.sendVerificationEmail(user.email, newCode, user.displayName).catch((err) => {
      console.error("[AUTH] Failed to resend verification email:", err);
    });

    return { message: "Verification code resent" };
  }

  async forgotPassword(email: string) {
    if (!email) throw { status: 400, message: "Email is required" };

    const user = await storage.getUserByEmail(email);
    if (!user) {
      return { message: "If an account exists with this email, a reset link has been sent." };
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000);

    await storage.updateUser(user.id, { resetToken, resetTokenExpiry });

    if (process.env.NODE_ENV === "development") {
      console.log(`[AUTH] Password reset token for ${email}: ${resetToken}`);
    }

    emailService.sendPasswordResetEmail(email, resetToken, user.displayName).catch((err) => {
      console.error("[AUTH] Failed to send password reset email:", err);
    });

    return { message: "If an account exists with this email, a reset link has been sent." };
  }

  async resetPassword(token: string, newPassword: string) {
    if (!token || !newPassword) throw { status: 400, message: "Token and new password required" };
    if (newPassword.length < 6) throw { status: 400, message: "Password must be at least 6 characters" };

    const user = await storage.getUserByResetToken(token);
    if (!user) throw { status: 400, message: "Invalid or expired reset link" };

    if (user.resetTokenExpiry && new Date(user.resetTokenExpiry) < new Date()) {
      throw { status: 400, message: "Reset link has expired. Please request a new one." };
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await storage.updateUser(user.id, {
      password: hashedPassword,
      resetToken: null,
      resetTokenExpiry: null,
    });

    return { message: "Password reset successfully. You can now sign in." };
  }

  async completeProfile(data: {
    userId: string;
    displayName?: string;
    bio?: string;
    avatar?: string;
    badge?: string;
    agentModel?: string;
    agentApiEndpoint?: string;
    agentDescription?: string;
    agentType?: string;
    publicKey?: string;
    callbackUrl?: string;
    capabilities?: string[];
    confidence?: number;
  }) {
    const { userId, ...fields } = data;
    if (!userId) throw { status: 400, message: "User ID required" };

    const user = await storage.getUser(userId);
    if (!user) throw { status: 404, message: "User not found" };

    const updateData: any = { profileCompleted: true };
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined && value !== null) {
        updateData[key] = value;
      }
    }

    const updated = await storage.updateUser(userId, updateData);
    return { ...updated, password: undefined };
  }
}

export const authService = new AuthService();
