import { Router } from "express";
import { storage } from "./storage";
import { hashPassword } from "./auth";
import bcrypt from "bcryptjs";

const router = Router();

// Dev-only endpoint to create test users
// Only works in development environment
router.post("/create-test-user", async (req, res) => {
  // Strict environment guard
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ message: "Not available in production" });
  }

  try {
    const testEmail = "test@inspect360.com";
    const testUsername = "testowner";
    const testPassword = "password123";
    const hashedPassword = await hashPassword(testPassword);

    // Check if test user already exists
    const existingUser = await storage.getUserByEmail(testEmail);
    
    if (existingUser) {
      return res.json({
        message: "Test user already exists",
        email: testEmail,
        username: testUsername,
        password: testPassword,
        role: existingUser.role,
      });
    }

    // Create new test user with organization
    // First create a temporary owner user to satisfy ownerId requirement
    const tempOwner = await storage.createUser({
      username: `temp_${Date.now()}`,
      email: `temp_${Date.now()}@example.com`,
      password: hashedPassword,
      role: "owner",
      firstName: "Temp",
      lastName: "Owner",
    });

    const organization = await storage.createOrganization({
      name: "Test Organization",
      ownerId: tempOwner.id,
      creditsRemaining: 100,
    });

    const user = await storage.createUser({
      username: testUsername,
      email: testEmail,
      password: hashedPassword,
      role: "owner",
      firstName: "Test",
      lastName: "Owner",
      organizationId: organization.id,
    });

    return res.json({
      message: "Test user created successfully",
      email: testEmail,
      username: testUsername,
      password: testPassword,
      role: user.role,
      organizationId: organization.id,
    });
  } catch (error: any) {
    console.error("Error creating test user:", error);
    return res.status(500).json({ 
      message: "Failed to create test user",
      error: error.message 
    });
  }
});

// Create test tenant user (development only)
router.post("/create-test-tenant", async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ message: "Not available in production" });
  }

  try {
    const tenantEmail = req.body.email || `tenant${Date.now()}@test.com`;
    const tenantPassword = req.body.password || "password123";
    const hashedPassword = await hashPassword(tenantPassword);

    // Check if user already exists
    const existing = await storage.getUserByEmail(tenantEmail);
    if (existing) {
      return res.json({
        message: "Tenant user already exists",
        email: tenantEmail,
        password: tenantPassword,
        userId: existing.id,
      });
    }

    // Get or create test organization
    let org = await storage.getOrganization("test-org-id");
    if (!org) {
      const tempOwner = await storage.createUser({
        username: `owner_${Date.now()}`,
        email: `owner_${Date.now()}@example.com`,
        password: hashedPassword,
        role: "owner",
        firstName: "Test",
        lastName: "Owner",
      });

      org = await storage.createOrganization({
        name: "Test BTR Organization",
        ownerId: tempOwner.id,
        creditsRemaining: 100,
      });
    }

    // Create tenant user
    const tenant = await storage.createUser({
      username: tenantEmail.split('@')[0],
      email: tenantEmail,
      password: hashedPassword,
      role: "tenant",
      firstName: "Test",
      lastName: "Tenant",
      organizationId: org.id,
    });

    // Create test property if none exists
    let property;
    const existingProperties = await storage.getPropertiesByOrganization(org.id);
    if (existingProperties.length > 0) {
      property = existingProperties[0];
    } else {
      property = await storage.createProperty({
        name: "Test Property Unit 101",
        address: "123 Test Street, Test City",
        sqft: 850,
        organizationId: org.id,
      });
    }

    // Create tenant assignment
    const tenancy = await storage.createTenantAssignment({
      organizationId: org.id,
      propertyId: property.id,
      tenantId: tenant.id,
      leaseStartDate: new Date(),
      leaseEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
      monthlyRent: "1500.00",
      depositAmount: "1500.00",
      isActive: true,
    });

    return res.json({
      message: "Test tenant created successfully",
      email: tenantEmail,
      password: tenantPassword,
      userId: tenant.id,
      propertyId: property.id,
      tenancyId: tenancy.id,
    });
  } catch (error: any) {
    console.error("Error creating test tenant:", error);
    return res.status(500).json({ 
      message: "Failed to create test tenant",
      error: error.message 
    });
  }
});

// Seed admin user (development only)
router.post("/seed-admin", async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ message: "Not available in production" });
  }

  try {
    const hashedPassword = await bcrypt.hash("admin123", 10);

    // Check if admin already exists
    const existing = await storage.getAdminByEmail("admin@inspect360.com");
    if (existing) {
      return res.json({
        message: "Admin user already exists",
        email: "admin@inspect360.com",
        password: "admin123",
      });
    }

    const admin = await storage.createAdmin({
      email: "admin@inspect360.com",
      password: hashedPassword,
      firstName: "Super",
      lastName: "Admin",
    });

    const { password, ...sanitizedAdmin } = admin;
    res.json({ 
      message: "Admin user created successfully", 
      admin: sanitizedAdmin,
      email: "admin@inspect360.com",
      password: "admin123",
    });
  } catch (error: any) {
    if (error.message?.includes("duplicate") || error.code === "23505") {
      return res.status(400).json({ message: "Admin user already exists" });
    }
    console.error("Error seeding admin:", error);
    res.status(500).json({ message: "Failed to seed admin user" });
  }
});

export { router as devRouter };
