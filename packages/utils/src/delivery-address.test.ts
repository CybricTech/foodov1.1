/**
 * These rules decide the address a rider is shown. Every case below is a real
 * string taken from production orders — the malformed ones are why the module
 * exists.
 */
import { describe, expect, it } from "vitest";
import {
  classifyAddress,
  composeDeliveryAddress,
  isDispatchableAddress,
  isRedundantAptUnit,
  tidyAddress,
} from "./delivery-address";

describe("tidyAddress", () => {
  it("collapses whitespace and drops empty comma segments", () => {
    expect(tidyAddress("11 Moundou  Street, , Wuse,  Abuja ")).toBe(
      "11 Moundou Street, Wuse, Abuja"
    );
  });

  it("treats blank and missing input as nothing", () => {
    expect(tidyAddress("   ")).toBeNull();
    expect(tidyAddress(null)).toBeNull();
    expect(tidyAddress(undefined)).toBeNull();
  });
});

describe("classifyAddress", () => {
  it("calls a leading building number precise", () => {
    expect(classifyAddress("17 Ogbomosho St, Garki, Abuja 900103, Nigeria")).toBe("precise");
    expect(classifyAddress("7 Ekoro Oruro River St, Maitama, Abuja")).toBe("precise");
  });

  it("calls a street without a number approximate", () => {
    expect(classifyAddress("Ibrahim Otaru Saliu Crescent, Abuja, Nigeria")).toBe("approximate");
    expect(classifyAddress("Bala Sokoto Way")).toBe("approximate");
  });

  it("detects plus-codes, including ones that start with digits", () => {
    // Would look "precise" to a naive leading-number test — it is the opposite.
    expect(classifyAddress("3FH2+X62, Mabushi, Abuja 900108, Nigeria")).toBe("plus_code");
    expect(classifyAddress("X92C+253, Trademore Av., Lugbe")).toBe("plus_code");
  });

  it("returns unknown for nothing", () => {
    expect(classifyAddress(null)).toBe("unknown");
    expect(classifyAddress("  ")).toBe("unknown");
  });
});

describe("isRedundantAptUnit", () => {
  it("catches the apartment box repeating the street", () => {
    expect(
      isRedundantAptUnit("11 Moundou Street, Wuse, Abuja, Nigeria", "11 moundou street")
    ).toBe(true);
  });

  it("ignores case and punctuation when comparing", () => {
    expect(isRedundantAptUnit("A7 Street, Airport Road, Abuja", "a7 street.")).toBe(true);
  });

  it("keeps a unit that adds real detail", () => {
    expect(isRedundantAptUnit("Paradise I Life Camp Estate, Abuja", "Bof 9 unit 2")).toBe(false);
    expect(isRedundantAptUnit("Marketsquare Gwarinpa, Ahmadu Bello Way", "No.3 Osa emokpae close")).toBe(false);
  });

  it("is one-directional — a longer unit containing the address is real detail", () => {
    expect(isRedundantAptUnit("A7 Street", "A7 Street house 16, green gate")).toBe(false);
  });

  it("is false when either side is missing", () => {
    expect(isRedundantAptUnit(null, "flat 2")).toBe(false);
    expect(isRedundantAptUnit("11 Moundou Street", null)).toBe(false);
  });
});

describe("composeDeliveryAddress", () => {
  it("joins a picked address with a genuine unit", () => {
    expect(
      composeDeliveryAddress({
        baseAddress: "Paradise I Life Camp Estate, Abuja, Nigeria",
        aptUnit: "Bof 9 unit 2",
      })
    ).toBe("Paradise I Life Camp Estate, Abuja, Nigeria, Bof 9 unit 2");
  });

  it("drops a unit that only repeats the street", () => {
    expect(
      composeDeliveryAddress({
        baseAddress: "11 Moundou Street, Wuse, Abuja, Nigeria",
        aptUnit: "11 moundou street",
      })
    ).toBe("11 Moundou Street, Wuse, Abuja, Nigeria");
  });

  it("falls back to the legacy column for orders placed before components existed", () => {
    expect(
      composeDeliveryAddress({
        baseAddress: null,
        aptUnit: null,
        legacyAddress: "26 Ubiaja Crescent, Abuja, Nigeria",
      })
    ).toBe("26 Ubiaja Crescent, Abuja, Nigeria");
  });

  it("prefers components over the legacy column when both exist", () => {
    expect(
      composeDeliveryAddress({
        baseAddress: "7 Ekoro Oruro River St, Maitama, Abuja",
        aptUnit: null,
        legacyAddress: "something stale",
      })
    ).toBe("7 Ekoro Oruro River St, Maitama, Abuja");
  });

  it("returns null when there is nothing at all", () => {
    expect(composeDeliveryAddress({})).toBeNull();
    expect(composeDeliveryAddress({ baseAddress: "  ", legacyAddress: "" })).toBeNull();
  });
});

describe("isDispatchableAddress", () => {
  it("accepts real addresses", () => {
    expect(isDispatchableAddress("17 Ogbomosho St, Garki, Abuja")).toBe(true);
    expect(isDispatchableAddress("Ibrahim Otaru Saliu Crescent, Abuja")).toBe(true);
  });

  it("rejects a plus-code — it tells a rider nothing their map doesn't", () => {
    expect(isDispatchableAddress("3FH2+X62, Mabushi, Abuja 900108, Nigeria")).toBe(false);
  });

  it("rejects nothing at all", () => {
    expect(isDispatchableAddress(null)).toBe(false);
  });
});
