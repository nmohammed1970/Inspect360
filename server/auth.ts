// Custom username/password authentication using passport-local
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import connectPg from "connect-pg-simple";
import * as cookieSignature from "cookie-signature";
import { storage } from "./storage";
import { User as DbUser, registerUserSchema, loginUserSchema } from "@shared/schema";

declare global {
  namespace Express {
    interface User extends DbUser { }
  }
}

const scryptAsync = promisify(scrypt);

// Password hashing utilities
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function comparePasswords(
  supplied: string,
  stored: string
): Promise<boolean> {
  // Validate inputs
  if (!supplied || !stored) {
    return false;
  }

  // Check if password is in bcrypt format FIRST (starts with $2a$, $2b$, or $2y$)
  // This must be checked before scrypt because bcrypt hashes can also contain "."
  if (stored.startsWith("$2a$") || stored.startsWith("$2b$") || stored.startsWith("$2y$")) {
    try {
      const bcrypt = await import("bcryptjs");
      return await bcrypt.compare(supplied, stored);
    } catch (error) {
      console.error("Error comparing bcrypt passwords:", error);
      return false;
    }
  }

  // Check if password is in scrypt format (hash.salt)
  // Scrypt format: hex_hash.salt (e.g., "abc123...def.salt123")
  if (stored.includes(".")) {
    const parts = stored.split(".");
    // Scrypt format should have exactly 2 parts: hash and salt
    // And the hash should be valid hex (even length, no $ prefix)
    if (parts.length === 2 && !stored.startsWith("$")) {
      const [hashed, salt] = parts;
      if (hashed && salt && hashed.length > 0 && salt.length > 0) {
        try {
          const hashedBuf = Buffer.from(hashed, "hex");
          const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
          // Ensure buffers have the same length before comparing
          if (hashedBuf.length === suppliedBuf.length) {
            return timingSafeEqual(hashedBuf, suppliedBuf);
          } else {
            console.error("Error comparing scrypt passwords: Buffer length mismatch", {
              hashedLength: hashedBuf.length,
              suppliedLength: suppliedBuf.length
            });
            return false;
          }
        } catch (error) {
          console.error("Error comparing scrypt passwords:", error);
          return false;
        }
      }
    }
  }

  // Unknown format - return false for security
  console.warn("Unknown password hash format");
  return false;
}

let sessionStoreInstance: session.Store | null = null;

export function getSessionStore(): session.Store {
  if (!sessionStoreInstance) {
    const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
    const pgStore = connectPg(session);
    sessionStoreInstance = new pgStore({
      conString: process.env.DATABASE_URL,
      createTableIfMissing: true, // Enable auto-creation in development
      ttl: sessionTtl,
      tableName: "sessions",
      // Add error handling for session store operations
      errorLog: (err: Error) => {
        console.error('[SESSION STORE ERROR]', err);
      },
    });
  }
  return sessionStoreInstance;
}

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const sessionStore = getSessionStore();
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false, // Changed to false to prevent unnecessary session updates
    saveUninitialized: false,
    rolling: true, // Reset expiration on activity
    cookie: {
      httpOnly: true,
      secure: false, // Disable secure in development
      sameSite: 'lax',
      maxAge: sessionTtl,
    },
    // Add error handling for session store
    name: 'inspect360.sid', // Custom session name to avoid conflicts
  });
}

// Helper function to extract user ID from a request-like object (for WebSocket)
export async function getUserIdFromRequest(req: { headers: { cookie?: string } }): Promise<string | null> {
  try {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) {
      return null;
    }

    // Parse cookies
    const cookies: Record<string, string> = {};
    cookieHeader.split(';').forEach(cookie => {
      const [name, ...rest] = cookie.trim().split('=');
      if (name) {
        cookies[name] = decodeURIComponent(rest.join('='));
      }
    });

    // Get session ID from cookie
    let sessionId = cookies['inspect360.sid'];
    if (!sessionId) {
      return null;
    }

    // Unsign the session ID (express-session signs session IDs in cookies)
    // Format is typically "s:unsignedSessionId.signature"
    const secret = process.env.SESSION_SECRET;
    if (!secret) {
      console.error('[getUserIdFromRequest] SESSION_SECRET not set');
      return null;
    }

    // Try to unsign the session ID
    let unsignedSessionId: string | false;
    if (sessionId.startsWith('s:')) {
      unsignedSessionId = cookieSignature.unsign(sessionId.slice(2), secret);
    } else {
      unsignedSessionId = cookieSignature.unsign(sessionId, secret);
    }
    if (!unsignedSessionId || typeof unsignedSessionId !== 'string') {
      // Invalid signature
      return null;
    }

    // Get session from store using the unsigned session ID
    const store = getSessionStore();
    const sessionData = await new Promise<any>((resolve, reject) => {
      store.get(unsignedSessionId as string, (err, session) => {
        if (err) {
          reject(err);
        } else {
          resolve(session);
        }
      });
    });

    if (!sessionData || !sessionData.passport || !sessionData.passport.user) {
      return null;
    }

    // passport.serializeUser stores just the user ID
    return sessionData.passport.user;
  } catch (error) {
    console.error('[getUserIdFromRequest] Error extracting user ID:', error);
    return null;
  }
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  // Configure passport-local strategy to use email instead of username
  passport.use(
    new LocalStrategy(
      { usernameField: 'email' },
      async (email, password, done) => {
        try {
          // Normalize email to lowercase for case-insensitive matching
          const normalizedEmail = email.toLowerCase().trim();
          const user = await storage.getUserByEmail(normalizedEmail);
          if (!user) {
            return done(null, false, { message: "Invalid email or password" });
          }

          // Check if user has a password set
          if (!user.password) {
            console.warn(`User ${user.id} (${user.email}) has no password set`);
            return done(null, false, { message: "Invalid email or password" });
          }

          const isValid = await comparePasswords(password, user.password);
          if (!isValid) {
            return done(null, false, { message: "Invalid email or password" });
          }

          // Check if user account is active
          if (!user.isActive) {
            return done(null, false, { message: "Account has been disabled. Please contact your administrator." });
          }

          // Check if user's organization is active
          if (user.organizationId) {
            const organization = await storage.getOrganization(user.organizationId);
            if (organization && organization.isActive === false) {
              return done(null, false, { message: "Your account has been blocked. Please contact admin." });
            }
          }

          return done(null, user);
        } catch (error) {
          console.error("Authentication error:", error);
          return done(error);
        }
      }
    )
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      if (!id) {
        console.warn('[Deserialize] No user ID provided in session');
        return done(null, false);
      }

      const user = await storage.getUser(id);

      if (!user) {
        console.warn(`[Deserialize] User not found for ID: ${id}`);
        // Clear the invalid session by returning false
        return done(null, false);
      }

      // Check if user is still active
      if (!user.isActive) {
        console.warn(`[Deserialize] User ${id} is inactive`);
        return done(null, false);
      }

      // Check if user's organization is active
      if (user.organizationId) {
        const organization = await storage.getOrganization(user.organizationId);
        if (organization && organization.isActive === false) {
          console.warn(`[Deserialize] Organization ${user.organizationId} is disabled for user ${id}`);
          return done(null, false);
        }
      }

      done(null, user);
    } catch (error) {
      console.error('[Deserialize] Error deserializing user:', error);
      // Return false instead of error to clear invalid session
      done(null, false);
    }
  });

  // Registration endpoint
  app.post("/api/register", async (req, res, next) => {
    try {
      // Validate input
      const validatedData = registerUserSchema.parse(req.body);

      // Normalize email to lowercase for case-insensitive storage
      const normalizedEmail = validatedData.email.toLowerCase().trim();

      // Check if username already exists
      const existingUser = await storage.getUserByUsername(validatedData.username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      // Check if email already exists
      const existingEmail = await storage.getUserByEmail(normalizedEmail);
      if (existingEmail) {
        return res.status(400).json({ message: "Email already exists" });
      }

      // Hash password and create user
      const hashedPassword = await hashPassword(validatedData.password);
      const user = await storage.createUser({
        ...validatedData,
        email: normalizedEmail,
        password: hashedPassword,
      });

      // Automatically create organization using the username (company name) field
      // Create organization for owner role, or if user doesn't have an organization yet
      if (user.role === "owner" || !user.organizationId) {
        try {
          // Get and validate country code from registration or default to GB
          const { COMMON_COUNTRIES, getCurrencyForCountry, COUNTRY_TO_CURRENCY } = await import('../shared/countryUtils');
          let countryCode = validatedData.countryCode || "GB";

          // Validate country code against supported countries
          const isValidCountry = COMMON_COUNTRIES.some(c => c.code === countryCode);
          if (!isValidCountry) {
            console.warn(`Invalid country code ${countryCode} provided, defaulting to GB`);
            countryCode = "GB";
          }

          // Determine currency based on country
          // getCurrencyForCountry will always return GBP, USD, or AED (valid enum values)
          // Countries not in the mapping default to GBP, which is safe for the database
          const preferredCurrency = getCurrencyForCountry(countryCode);
          
          // Log for debugging if currency doesn't match country's actual currency
          if (!COUNTRY_TO_CURRENCY[countryCode]) {
            console.log(`[Registration] Country ${countryCode} not in currency mapping, using default: ${preferredCurrency}`);
          }
          
          // Log for debugging if currency doesn't match country's actual currency
          if (!COUNTRY_TO_CURRENCY[countryCode]) {
            console.log(`[Registration] Country ${countryCode} not in currency mapping, using default: ${preferredCurrency}`);
          }

          // Create organization using username as company name
          const organization = await storage.createOrganization({
            name: validatedData.username, // Company name from registration form
            ownerId: user.id,
            countryCode: countryCode,
            preferredCurrency: preferredCurrency, // Set currency based on country
            // Credits are now granted via credit batch system (see below)
          });

          // Update user with organization ID
          const updatedUser = await storage.upsertUser({
            ...user,
            organizationId: organization.id,
            role: user.role === "owner" ? "owner" : user.role, // Keep original role
          });

          // Grant 5 free inspection credits as signup reward using the new credit system
          // Check if organization already has signup credits to avoid duplicates
          try {
            const batches = await storage.getCreditBatchesByOrganization(organization.id);
            const hasSignupCredits = batches.some(batch => 
              batch.grantSource === 'admin_grant' && 
              batch.metadataJson && 
              typeof batch.metadataJson === 'object' &&
              (batch.metadataJson as any)?.adminNotes?.toLowerCase().includes('signup reward')
            );

            if (!hasSignupCredits) {
              const { subscriptionService } = await import("./subscriptionService");
              await subscriptionService.grantCredits(
                organization.id,
                5,
                "admin_grant",
                undefined, // No expiration date for signup credits
                {
                  adminNotes: "Signup reward - Welcome bonus for new user registration",
                  createdBy: user.id,
                }
              );
              console.log(`✓ Granted 5 signup reward credits to new organization ${organization.id}`);
            } else {
              console.log(`✓ Organization ${organization.id} already has signup credits, skipping`);
            }
          } catch (creditError: any) {
            console.error("Warning: Failed to grant signup credits:", creditError);
            // No fallback - credit batch system is required
          }

          // Create default inspection templates
          try {
            const { DEFAULT_TEMPLATES } = await import('./defaultTemplates');
            for (const template of DEFAULT_TEMPLATES) {
              await storage.createInspectionTemplate({
                organizationId: organization.id,
                name: template.name,
                description: template.description,
                scope: template.scope,
                version: 1,
                isActive: true,
                structureJson: template.structureJson,
                categoryId: template.categoryId,
                createdBy: user.id,
              });
            }
            console.log(`✓ Created default templates for new organization ${organization.id}`);
          } catch (templateError) {
            console.error("Warning: Failed to create default templates:", templateError);
          }

          // Create sample data (Block A, Property A, Joe Bloggs tenant)
          try {
            const uniqueSuffix = Date.now().toString(36);

            // Create Block A
            const blockA = await storage.createBlock({
              organizationId: organization.id,
              name: "Block A",
              address: "123 Sample Street, Sample City, SC 12345",
              notes: "Sample block created automatically for demonstration purposes",
            });

            // Create Property A linked to Block A
            const propertyA = await storage.createProperty({
              organizationId: organization.id,
              blockId: blockA.id,
              name: "Property A",
              address: "Unit 101, Block A, 123 Sample Street, Sample City, SC 12345",
              sqft: 850,
            });

            // Create sample tenant user "Joe Bloggs"
            const tenantPassword = await hashPassword("password123");
            const joeBloggs = await storage.createUser({
              email: `joe.bloggs+${uniqueSuffix}@inspect360.demo`,
              username: `joe_bloggs_${uniqueSuffix}`,
              password: tenantPassword,
              firstName: "Joe",
              lastName: "Bloggs",
              role: "tenant",
              organizationId: organization.id,
              isActive: true,
            });

            // Create tenant assignment
            await storage.createTenantAssignment({
              organizationId: organization.id,
              propertyId: propertyA.id,
              tenantId: joeBloggs.id,
              leaseStartDate: new Date(),
              leaseEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
              monthlyRent: "1200.00",
              depositAmount: "1200.00",
              isActive: true,
              notes: "Sample tenant assignment created for demonstration purposes",
            });

            console.log(`✓ Sample data created for organization ${organization.id}`);
          } catch (sampleDataError) {
            console.error("Warning: Failed to create sample data:", sampleDataError);
          }

          // Log user in after registration with updated user data
          req.login(updatedUser, (err) => {
            if (err) return next(err);

            // Don't send password to client
            const { password, resetToken, resetTokenExpiry, ...userWithoutPassword } = updatedUser;
            res.status(201).json(userWithoutPassword);
          });
        } catch (orgError) {
          console.error("Error creating organization during registration:", orgError);
          // If org creation fails, still log the user in but without org
          req.login(user, (err) => {
            if (err) return next(err);
            const { password, resetToken, resetTokenExpiry, ...userWithoutPassword } = user;
            res.status(201).json(userWithoutPassword);
          });
        }
      } else {
        // For non-owner roles, just log them in normally
        req.login(user, (err) => {
          if (err) return next(err);

          // Don't send password to client
          const { password, resetToken, resetTokenExpiry, ...userWithoutPassword } = user;
          res.status(201).json(userWithoutPassword);
        });
      }
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({
          message: "Validation error",
          errors: error.errors
        });
      }
      console.error("Registration error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  // Login endpoint
  app.post("/api/login", (req, res, next) => {
    try {
      // Validate input
      loginUserSchema.parse(req.body);

      passport.authenticate("local", (err: any, user: DbUser | false, info: any) => {
        if (err) {
          console.error('[LOGIN ERROR] Authentication error:', err);
          return next(err);
        }
        if (!user) {
          return res.status(401).json({
            message: info?.message || "Invalid email or password"
          });
        }

        // Regenerate session to avoid conflicts with existing sessions
        // This allows the same user to be logged in from multiple devices/locations
        // Wrap in try-catch to handle any synchronous errors
        try {
          req.session.regenerate((regenErr) => {
            if (regenErr) {
              console.error('[LOGIN ERROR] Session regeneration failed:', regenErr);
              // If regeneration fails, try to continue with existing session
              // This handles cases where regeneration isn't critical
            }

            req.login(user, (loginErr) => {
              if (loginErr) {
                console.error('[LOGIN ERROR] Login failed:', loginErr);
                // If login fails due to session issues, try to respond anyway
                // The authentication was successful, so we can still return user data
                const { password, resetToken, resetTokenExpiry, ...userWithoutPassword } = user;
                console.warn('[LOGIN WARNING] Login callback failed but continuing:', loginErr.message);
                return res.status(200).json(userWithoutPassword);
              }

              // Explicitly save the session before responding
              req.session.save((saveErr) => {
                if (saveErr) {
                  console.error('[LOGIN ERROR] Session save failed:', saveErr);
                  // If session save fails, still try to respond with user data
                  // The session might still work, just not persisted yet
                  const { password, resetToken, resetTokenExpiry, ...userWithoutPassword } = user;
                  console.warn('[LOGIN WARNING] Session save failed but continuing:', saveErr.message);
                  return res.status(200).json(userWithoutPassword);
                }

                // Don't send password to client
                const { password, resetToken, resetTokenExpiry, ...userWithoutPassword } = user;
                console.log('[LOGIN SUCCESS] User logged in:', {
                  id: userWithoutPassword.id,
                  email: userWithoutPassword.email,
                  role: userWithoutPassword.role,
                  organizationId: userWithoutPassword.organizationId,
                });
                res.json(userWithoutPassword);
              });
            });
          });
        } catch (sessionError: any) {
          // If session regeneration throws synchronously, log and continue
          console.error('[LOGIN ERROR] Session regeneration threw error:', sessionError);
          // Try to login anyway - the session might still work
          req.login(user, (loginErr) => {
            if (loginErr) {
              console.error('[LOGIN ERROR] Login failed after session error:', loginErr);
              const { password, resetToken, resetTokenExpiry, ...userWithoutPassword } = user;
              return res.status(200).json(userWithoutPassword);
            }
            const { password, resetToken, resetTokenExpiry, ...userWithoutPassword } = user;
            res.json(userWithoutPassword);
          });
        }
      })(req, res, next);
    } catch (error: any) {
      console.error('[LOGIN ERROR] Validation or other error:', error);
      if (error.name === "ZodError") {
        return res.status(400).json({
          message: "Validation error",
          errors: error.errors
        });
      }
      res.status(401).json({ message: "Invalid username or password" });
    }
  });

  // Logout endpoint
  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.json({ message: "Logged out successfully" });
    });
  });

  // Get current user endpoint
  app.get("/api/user", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Fetch organization to get country code
    let organizationCountryCode = "GB"; // Default
    if (req.user.organizationId) {
      const org = await storage.getOrganization(req.user.organizationId);
      if (org) {
        organizationCountryCode = org.countryCode || "GB";
      }
    }

    // Don't send password to client, add organizationCountryCode
    const { password, resetToken, resetTokenExpiry, ...userWithoutPassword } = req.user;
    res.json({ ...userWithoutPassword, organizationCountryCode });
  });

  // Forgot password - request reset token
  app.post("/api/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      // Normalize email to lowercase for case-insensitive matching
      const normalizedEmail = email.toLowerCase().trim();
      const user = await storage.getUserByEmail(normalizedEmail);
      if (!user) {
        // Email not found - tell user to sign up
        return res.status(404).json({
          message: "Email not found. Please sign up to create an account.",
          emailSent: false,
          emailNotFound: true
        });
      }

      // Generate reset token (6-digit code for simplicity)
      const resetToken = Math.floor(100000 + Math.random() * 900000).toString();
      const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await storage.setResetToken(user.id, resetToken, expiry);

      // Send password reset email
      let emailSent = false;
      try {
        const { sendPasswordResetEmail } = await import('./resend');
        const displayName = user.firstName
          ? `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}`
          : user.username;
        await sendPasswordResetEmail(
          user.email,
          displayName,
          resetToken
        );
        emailSent = true;
      } catch (emailError) {
        console.error('Failed to send password reset email:', emailError);
        // If email fails, still return success but indicate email wasn't sent
        return res.status(500).json({
          message: "Failed to send reset email. Please try again later.",
          emailSent: false
        });
      }

      // Return success with email sent indicator
      res.json({
        message: "Password reset code has been sent to your email",
        emailSent: true
      });
    } catch (error) {
      console.error("Forgot password error:", error);
      res.status(500).json({ message: "Failed to process request" });
    }
  });

  // Reset password with token
  app.post("/api/reset-password", async (req, res) => {
    try {
      const { email, token, newPassword } = req.body;

      if (!email || !token || !newPassword) {
        return res.status(400).json({ message: "Email, token, and new password are required" });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }

      // Normalize email to lowercase for case-insensitive matching
      const normalizedEmail = email.toLowerCase().trim();
      const user = await storage.getUserByEmail(normalizedEmail);
      if (!user || !user.resetToken || !user.resetTokenExpiry) {
        return res.status(400).json({ message: "Invalid or expired reset token" });
      }

      // Check if token matches and hasn't expired
      if (user.resetToken !== token || new Date() > user.resetTokenExpiry) {
        return res.status(400).json({ message: "Invalid or expired reset token" });
      }

      // Update password and clear reset token
      const hashedPassword = await hashPassword(newPassword);
      await storage.updatePassword(user.id, hashedPassword);
      await storage.clearResetToken(user.id);

      res.json({ message: "Password reset successfully" });
    } catch (error) {
      console.error("Reset password error:", error);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });
}

// Middleware to check if user is authenticated
export async function isAuthenticated(req: any, res: any, next: any) {
  // If deserialization failed, req.user will be false or undefined
  // Clear the invalid session and return unauthorized
  if (req.user === false) {
    req.logout((err: any) => {
      if (err) console.error('[isAuthenticated] Error clearing invalid session:', err);
    });
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (req.isAuthenticated() && req.user) {
    // Check if user's organization is active
    if (req.user.organizationId) {
      try {
        const organization = await storage.getOrganization(req.user.organizationId);
        if (organization && organization.isActive === false) {
          // Log out the user since their organization is disabled
          req.logout((err: any) => {
            if (err) console.error('[isAuthenticated] Error logging out user from disabled org:', err);
          });
          return res.status(403).json({ message: "Your account has been blocked. Please contact admin." });
        }
      } catch (error) {
        console.error('[isAuthenticated] Error checking organization status:', error);
        // Allow request to continue if we can't check org status (graceful degradation)
      }
    }
    return next();
  }
  res.status(401).json({ message: "Unauthorized" });
}

// Role-based middleware
export function requireRole(...allowedRoles: string[]) {
  return async (req: any, res: any, next: any) => {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: "Forbidden: Insufficient permissions"
      });
    }

    next();
  };
}
