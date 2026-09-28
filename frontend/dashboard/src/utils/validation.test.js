// src/utils/validation.test.js
import { describe, it, expect } from "vitest";
import {
  isValidEmail,
  isValidPassword,
  isValidRoomName,
  formatWatts,
  formatEnergy,
  estimateCost,
  isOverConsuming,
} from "./validation";

describe("form validation", () => {
  it("should accept a well formed email address", () => {
    expect(isValidEmail("rapha@energibox.cm")).toBe(true);
  });

  it("should reject an email address without a domain", () => {
    expect(isValidEmail("rapha@")).toBe(false);
  });

  it("should accept a password of at least eight characters", () => {
    expect(isValidPassword("EnergiBox2026")).toBe(true);
  });

  it("should reject a password that is too short", () => {
    expect(isValidPassword("abc")).toBe(false);
  });

  it("should accept a valid room name", () => {
    expect(isValidRoomName("Living room")).toBe(true);
  });

  it("should reject an empty room name", () => {
    expect(isValidRoomName("  ")).toBe(false);
  });
});

describe("display of the consumption", () => {
  it("should display a small power in watts", () => {
    expect(formatWatts(60)).toBe("60 W");
  });

  it("should convert a large power into kilowatts", () => {
    expect(formatWatts(2400)).toBe("2.40 kW");
  });

  it("should display the energy with two decimals", () => {
    expect(formatEnergy(12.3456)).toBe("12.35 kWh");
  });

  it("should return a dash when the value is unknown", () => {
    expect(formatWatts(undefined)).toBe("—");
  });
});

describe("estimation of the cost", () => {
  it("should compute the cost of the energy consumed", () => {
    expect(estimateCost(10)).toBe(790);
  });

  it("should accept another tariff", () => {
    expect(estimateCost(10, 100)).toBe(1000);
  });

  it("should return zero for a negative consumption", () => {
    expect(estimateCost(-5)).toBe(0);
  });
});

describe("detection of the overconsumption", () => {
  it("should signal a consumption above the baseline", () => {
    expect(isOverConsuming(150, 100)).toBe(true);
  });

  it("should not signal a consumption within the margin", () => {
    expect(isOverConsuming(115, 100)).toBe(false);
  });

  it("should not signal anything without a baseline", () => {
    expect(isOverConsuming(150, 0)).toBe(false);
  });
});