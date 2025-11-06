/**
 * CLI Middleware Tests
 *
 * Tests for CLI authentication and request transformation
 */

import {
  describe,
  test,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  mock,
} from "bun:test";
import { authenticateCLI } from "../cli.middleware";
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// Set environment variable for tests
const CLI_JWT_SECRET = "test-secret-key-for-cli-testing";

describe("CLI Authentication Middleware", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let statusMock: any;
  let jsonMock: any;
  let originalSecret: string | undefined;

  beforeAll(() => {
    // Save original env var and set test secret
    originalSecret = process.env.CLI_AUTH_JWT_SECRET;
    process.env.CLI_AUTH_JWT_SECRET = CLI_JWT_SECRET;
  });

  afterAll(() => {
    // Restore original env var
    if (originalSecret) {
      process.env.CLI_AUTH_JWT_SECRET = originalSecret;
    } else {
      delete process.env.CLI_AUTH_JWT_SECRET;
    }
  });

  beforeEach(() => {
    // Reset mocks
    jsonMock = mock(() => mockRes);
    statusMock = mock(() => ({
      json: jsonMock,
    }));

    mockReq = {
      headers: {},
      cli: undefined,
    };

    mockRes = {
      status: statusMock,
      json: jsonMock,
    };

    mockNext = mock(() => {});
  });

  describe("Token Validation", () => {
    test("should reject requests without Authorization header", async () => {
      await authenticateCLI(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        error: "Unauthorized",
        message: "Missing Authorization header",
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test("should reject requests with malformed Authorization header", async () => {
      mockReq.headers = {
        authorization: "InvalidFormat",
      };

      await authenticateCLI(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    test("should reject requests with invalid Bearer token", async () => {
      mockReq.headers = {
        authorization: "Bearer invalid-token",
      };

      await authenticateCLI(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    test("should accept valid Bearer token and attach CLI context", async () => {
      const payload = {
        email: "test@example.com",
        type: "cli",
        keyId: "key_123",
        name: "Test Key",
      };

      const token = jwt.sign(payload, CLI_JWT_SECRET);

      mockReq.headers = {
        authorization: `Bearer ${token}`,
      };

      await authenticateCLI(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.cli).toBeDefined();
      expect(mockReq.cli?.email).toBe("test@example.com");
      expect(mockReq.cli?.keyId).toBe("key_123");
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe("Token Payload Validation", () => {
    test("should reject tokens without email", async () => {
      const payload = {
        type: "cli",
        keyId: "key_123",
      };

      const token = jwt.sign(payload, CLI_JWT_SECRET);

      mockReq.headers = {
        authorization: `Bearer ${token}`,
      };

      await authenticateCLI(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        error: "Unauthorized",
        message: "Invalid token payload",
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test("should reject tokens without type=cli", async () => {
      const payload = {
        email: "test@example.com",
        type: "user",
        keyId: "key_123",
      };

      const token = jwt.sign(payload, CLI_JWT_SECRET);

      mockReq.headers = {
        authorization: `Bearer ${token}`,
      };

      await authenticateCLI(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    test("should accept tokens with optional expiration", async () => {
      const payload = {
        email: "test@example.com",
        type: "cli",
        keyId: "key_123",
        exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      };

      const token = jwt.sign(payload, CLI_JWT_SECRET, { noTimestamp: true });

      mockReq.headers = {
        authorization: `Bearer ${token}`,
      };

      await authenticateCLI(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    test("should reject expired tokens", async () => {
      const payload = {
        email: "test@example.com",
        type: "cli",
        keyId: "key_123",
        exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
      };

      const token = jwt.sign(payload, CLI_JWT_SECRET, { noTimestamp: true });

      mockReq.headers = {
        authorization: `Bearer ${token}`,
      };

      await authenticateCLI(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe("Request Context", () => {
    test("should attach email to req.cli", async () => {
      const payload = {
        email: "developer@example.com",
        type: "cli",
        keyId: "key_456",
      };

      const token = jwt.sign(payload, CLI_JWT_SECRET);

      mockReq.headers = {
        authorization: `Bearer ${token}`,
      };

      await authenticateCLI(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.cli?.email).toBe("developer@example.com");
    });

    test("should attach keyId to req.cli", async () => {
      const payload = {
        email: "test@example.com",
        type: "cli",
        keyId: "key_unique_789",
      };

      const token = jwt.sign(payload, CLI_JWT_SECRET);

      mockReq.headers = {
        authorization: `Bearer ${token}`,
      };

      await authenticateCLI(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.cli?.keyId).toBe("key_unique_789");
    });

    test("should attach optional name to req.cli", async () => {
      const payload = {
        email: "test@example.com",
        type: "cli",
        keyId: "key_123",
        name: "Production Key",
      };

      const token = jwt.sign(payload, CLI_JWT_SECRET);

      mockReq.headers = {
        authorization: `Bearer ${token}`,
      };

      await authenticateCLI(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.cli?.name).toBe("Production Key");
    });
  });

  describe("Security", () => {
    test("should handle missing JWT secret", async () => {
      const tempSecret = process.env.CLI_AUTH_JWT_SECRET;
      delete process.env.CLI_AUTH_JWT_SECRET;

      // Need to re-import to pick up env change
      const { authenticateCLI: authCLI } = await import("../cli.middleware");

      await authCLI(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(500);

      // Restore
      process.env.CLI_AUTH_JWT_SECRET = tempSecret;
    });

    test("should not expose secret in error messages", async () => {
      mockReq.headers = {
        authorization: "Bearer invalid-token",
      };

      await authenticateCLI(mockReq as Request, mockRes as Response, mockNext);

      expect(jsonMock).not.toHaveBeenCalledWith(
        expect.objectContaining({
          secret: expect.anything(),
        }),
      );
    });

    test("should handle JWT verification errors gracefully", async () => {
      const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature";

      mockReq.headers = {
        authorization: `Bearer ${token}`,
      };

      await authenticateCLI(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe("Edge Cases", () => {
    test("should handle tokens with extra whitespace", async () => {
      const payload = {
        email: "test@example.com",
        type: "cli",
        keyId: "key_123",
      };

      const token = jwt.sign(payload, CLI_JWT_SECRET);

      mockReq.headers = {
        authorization: `  Bearer ${token}  `,
      };

      await authenticateCLI(mockReq as Request, mockRes as Response, mockNext);

      // Should either accept (after trim) or reject consistently
      expect(statusMock).toHaveBeenCalled();
    });

    test("should handle case-insensitive Bearer keyword", async () => {
      const payload = {
        email: "test@example.com",
        type: "cli",
        keyId: "key_123",
      };

      const token = jwt.sign(payload, CLI_JWT_SECRET);

      mockReq.headers = {
        authorization: `bearer ${token}`,
      };

      await authenticateCLI(mockReq as Request, mockRes as Response, mockNext);

      // Implementation detail: may or may not be case-insensitive
      expect(statusMock).toHaveBeenCalled();
    });

    test("should handle very long tokens", async () => {
      const payload = {
        email: "test@example.com",
        type: "cli",
        keyId: "key_123",
        metadata: "x".repeat(1000), // Large payload
      };

      const token = jwt.sign(payload, CLI_JWT_SECRET);

      mockReq.headers = {
        authorization: `Bearer ${token}`,
      };

      await authenticateCLI(mockReq as Request, mockRes as Response, mockNext);

      // Should handle large tokens gracefully
      expect(statusMock).toHaveBeenCalled();
    });
  });

  describe("Integration with Request Flow", () => {
    test("should allow request to proceed after successful auth", async () => {
      const payload = {
        email: "test@example.com",
        type: "cli",
        keyId: "key_123",
      };

      const token = jwt.sign(payload, CLI_JWT_SECRET);

      mockReq.headers = {
        authorization: `Bearer ${token}`,
      };

      await authenticateCLI(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(statusMock).not.toHaveBeenCalled();
    });

    test("should stop request flow on auth failure", async () => {
      mockReq.headers = {
        authorization: "Bearer invalid",
      };

      await authenticateCLI(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(401);
    });
  });
});
