import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/clarinet-sdk";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!; // Project Developer
const wallet2 = accounts.get("wallet_2")!; // Credit Buyer
const verifier = accounts.get("wallet_3")!; // Approved Verifier
const flagger = accounts.get("wallet_4")!;

describe("GreenStac Contract Tests", () => {
  describe("Utility Logic", () => {
    it("can increment and decrement counter", () => {
      let result = simnet.callPublicFn("greenstac", "increment-counter", [], wallet1);
      expect(result.result).toBeOk(Cl.int(1));
      
      result = simnet.callPublicFn("greenstac", "increment-counter", [], wallet1);
      expect(result.result).toBeOk(Cl.int(2));
      
      result = simnet.callPublicFn("greenstac", "decrement-counter", [], wallet1);
      expect(result.result).toBeOk(Cl.int(1));
      
      const getCounter = simnet.callReadOnlyFn("greenstac", "get-counter", [], wallet1);
      expect(getCounter.result).toBeInt(1);
    });
  });

  describe("Verifier Management", () => {
    it("contract owner can add a verifier", () => {
      const result = simnet.callPublicFn("greenstac", "add-verifier", [
        Cl.principal(verifier),
        Cl.stringUtf8("Earth Verifiers LLC"),
        Cl.stringUtf8("ISO 14065 Accredited")
      ], deployer);
      
      expect(result.result).toBeOk(Cl.bool(true));
      
      const verifierInfo = simnet.callReadOnlyFn("greenstac", "get-verifier", [Cl.principal(verifier)], wallet1);
      expect(verifierInfo.result).toBeSome(Cl.tuple({
        name: Cl.stringUtf8("Earth Verifiers LLC"),
        accreditation: Cl.stringUtf8("ISO 14065 Accredited"),
        active: Cl.bool(true)
      }));
    });

    it("non-owner cannot add a verifier", () => {
      const result = simnet.callPublicFn("greenstac", "add-verifier", [
        Cl.principal(wallet2),
        Cl.stringUtf8("Fake Verifier"),
        Cl.stringUtf8("None")
      ], wallet1);
      
      expect(result.result).toBeErr(Cl.uint(607)); // err-not-verifier
    });
  });

  describe("Project Registration", () => {
    it("can register a REDD+ project", () => {
      const result = simnet.callPublicFn("greenstac", "register-project", [
        Cl.stringUtf8("Amazon Conservation Project"),
        Cl.stringAscii("REDD+"),
        Cl.stringUtf8("Brazil"),
        Cl.stringUtf8("Verra VCS"),
        Cl.uint(10000),
        Cl.stringUtf8("ipfs://metadata-hash")
      ], wallet1);
      
      expect(result.result).toBeOk(Cl.uint(1));
      
      const project = simnet.callReadOnlyFn("greenstac", "get-project", [Cl.uint(1)], wallet1);
      expect(project.result).toBeSome(Cl.tuple({
        name: Cl.stringUtf8("Amazon Conservation Project"),
        developer: Cl.principal(wallet1),
        "project-type": Cl.stringAscii("REDD+"),
        country: Cl.stringUtf8("Brazil"),
        methodology: Cl.stringUtf8("Verra VCS"),
        "estimated-annual-tonnes": Cl.uint(10000),
        verified: Cl.bool(false),
        verifier: Cl.none(),
        "total-issued": Cl.uint(0),
        "total-retired": Cl.uint(0),
        "metadata-uri": Cl.stringUtf8("ipfs://metadata-hash"),
        status: Cl.stringAscii("PENDING")
      }));
    });

    it("rejects invalid project type", () => {
      const result = simnet.callPublicFn("greenstac", "register-project", [
        Cl.stringUtf8("Invalid Project"),
        Cl.stringAscii("INVALID"),
        Cl.stringUtf8("Nowhere"),
        Cl.stringUtf8("Methodology"),
        Cl.uint(1000),
        Cl.stringUtf8("ipfs://...")
      ], wallet1);
      
      expect(result.result).toBeErr(Cl.uint(610)); // err-invalid-project-type
    });
  });

  describe("Project Verification", () => {
    it("verifier can verify a pending project", () => {
      // Register project 1
      simnet.callPublicFn("greenstac", "register-project", [
        Cl.stringUtf8("Amazon Conservation"),
        Cl.stringAscii("REDD+"),
        Cl.stringUtf8("Brazil"),
        Cl.stringUtf8("Verra"),
        Cl.uint(10000),
        Cl.stringUtf8("ipfs://...")
      ], wallet1);

      // Deployer adds verifier
      simnet.callPublicFn("greenstac", "add-verifier", [
        Cl.principal(verifier),
        Cl.stringUtf8("Verifier"),
        Cl.stringUtf8("Accreditation")
      ], deployer);

      const result = simnet.callPublicFn("greenstac", "verify-project", [
        Cl.uint(1),
        Cl.stringUtf8("ipfs://verification-report")
      ], verifier);
      
      expect(result.result).toBeOk(Cl.bool(true));
      
      const project = simnet.callReadOnlyFn("greenstac", "get-project", [Cl.uint(1)], wallet1);
      const val = project.result as any;
      expect(val.value.data.verified).toBeBool(true);
      expect(val.value.data.status).toBeAscii("VERIFIED");
    });
  });

  describe("Credit Issuance", () => {
    it("developer can issue credits on a verified project", () => {
      // Setup: register project and verify
      simnet.callPublicFn("greenstac", "register-project", [
        Cl.stringUtf8("Project 1"), Cl.stringAscii("REDD+"), Cl.stringUtf8("Country"), Cl.stringUtf8("Meth"), Cl.uint(10000), Cl.stringUtf8("")
      ], wallet1);
      simnet.callPublicFn("greenstac", "add-verifier", [Cl.principal(verifier), Cl.stringUtf8("V"), Cl.stringUtf8("A")], deployer);
      simnet.callPublicFn("greenstac", "verify-project", [Cl.uint(1), Cl.stringUtf8("")], verifier);

      const result = simnet.callPublicFn("greenstac", "issue-credits", [
        Cl.uint(1), 
        Cl.uint(500), 
        Cl.uint(2025), 
        Cl.some(Cl.stringUtf8("ipfs://batch-uri"))
      ], wallet1);
      
      expect(result.result).toBeOk(Cl.uint(1)); // Batch ID 1
      
      const batch = simnet.callReadOnlyFn("greenstac", "get-batch", [Cl.uint(1)], wallet1);
      expect(batch.result).toBeSome(Cl.tuple({
        "project-id": Cl.uint(1),
        "credits-issued": Cl.uint(500),
        "credits-retired": Cl.uint(0),
        "vintage-year": Cl.uint(2025),
        "issuance-block": Cl.uint(simnet.blockHeight), // block-height at iteration
        "metadata-uri": Cl.some(Cl.stringUtf8("ipfs://batch-uri")),
        status: Cl.stringAscii("ACTIVE")
      }));
    });
    
    it("virtual credit IDs match owner and batch info", () => {
      // Setup
      simnet.callPublicFn("greenstac", "register-project", [Cl.stringUtf8("P1"), Cl.stringAscii("REDD+"), Cl.stringUtf8("C"), Cl.stringUtf8("M"), Cl.uint(100), Cl.stringUtf8("")], wallet1);
      simnet.callPublicFn("greenstac", "add-verifier", [Cl.principal(verifier), Cl.stringUtf8("V"), Cl.stringUtf8("A")], deployer);
      simnet.callPublicFn("greenstac", "verify-project", [Cl.uint(1), Cl.stringUtf8("")], verifier);
      simnet.callPublicFn("greenstac", "issue-credits", [Cl.uint(1), Cl.uint(100), Cl.uint(2025), Cl.none()], wallet1);
      
      // Batch ID is 1, so credit IDs are 1,000,000,000 to 1,000,000,099
      const creditId = Cl.uint(1000000000); // offset 0
      const credit = simnet.callReadOnlyFn("greenstac", "get-credit", [creditId], wallet1);
      expect(credit.result).toBeSome(Cl.tuple({
        "batch-id": Cl.uint(1),
        "project-id": Cl.uint(1),
        owner: Cl.principal(wallet1),
        "vintage-year": Cl.uint(2025),
        status: Cl.stringAscii("ACTIVE"),
        "issued-at": Cl.uint(simnet.blockHeight)
      }));
    });
  });

  describe("Credit Transfer", () => {
    it("can transfer credits to another address", () => {
      // Setup
      simnet.callPublicFn("greenstac", "register-project", [Cl.stringUtf8("P1"), Cl.stringAscii("REDD+"), Cl.stringUtf8("C"), Cl.stringUtf8("M"), Cl.uint(100), Cl.stringUtf8("")], wallet1);
      simnet.callPublicFn("greenstac", "add-verifier", [Cl.principal(verifier), Cl.stringUtf8("V"), Cl.stringUtf8("A")], deployer);
      simnet.callPublicFn("greenstac", "verify-project", [Cl.uint(1), Cl.stringUtf8("")], verifier);
      simnet.callPublicFn("greenstac", "issue-credits", [Cl.uint(1), Cl.uint(10), Cl.uint(2025), Cl.none()], wallet1);
      
      const creditId1 = Cl.uint(1000000000);
      const creditId2 = Cl.uint(1000000001);
      
      const result = simnet.callPublicFn("greenstac", "transfer-credits", [
        Cl.list([creditId1, creditId2]),
        Cl.principal(wallet2),
        Cl.some(Cl.stringUtf8("Bought 2 credits"))
      ], wallet1);
      
      expect(result.result).toBeOk(Cl.bool(true));
      
      // Verify new owner
      const credit = simnet.callReadOnlyFn("greenstac", "get-credit", [creditId1], wallet1);
      const val = credit.result as any;
      expect(val.value.data.owner).toEqual(Cl.principal(wallet2));
    });

    it("prevents self-transfer", () => {
      // Setup
      simnet.callPublicFn("greenstac", "register-project", [Cl.stringUtf8("P1"), Cl.stringAscii("REDD+"), Cl.stringUtf8("C"), Cl.stringUtf8("M"), Cl.uint(100), Cl.stringUtf8("")], wallet1);
      simnet.callPublicFn("greenstac", "add-verifier", [Cl.principal(verifier), Cl.stringUtf8("V"), Cl.stringUtf8("A")], deployer);
      simnet.callPublicFn("greenstac", "verify-project", [Cl.uint(1), Cl.stringUtf8("")], verifier);
      simnet.callPublicFn("greenstac", "issue-credits", [Cl.uint(1), Cl.uint(10), Cl.uint(2025), Cl.none()], wallet1);
      
      const creditId = Cl.uint(1000000000);
      const result = simnet.callPublicFn("greenstac", "transfer-credits", [
        Cl.list([creditId]),
        Cl.principal(wallet1),
        Cl.none()
      ], wallet1);
      
      expect(result.result).toBeErr(Cl.uint(615)); // err-self-transfer
    });
  });

  describe("Credit Retirement", () => {
    it("can retire credits and update global ledger", () => {
      // Setup
      simnet.callPublicFn("greenstac", "register-project", [Cl.stringUtf8("P1"), Cl.stringAscii("REDD+"), Cl.stringUtf8("C"), Cl.stringUtf8("M"), Cl.uint(100), Cl.stringUtf8("")], wallet1);
      simnet.callPublicFn("greenstac", "add-verifier", [Cl.principal(verifier), Cl.stringUtf8("V"), Cl.stringUtf8("A")], deployer);
      simnet.callPublicFn("greenstac", "verify-project", [Cl.uint(1), Cl.stringUtf8("")], verifier);
      simnet.callPublicFn("greenstac", "issue-credits", [Cl.uint(1), Cl.uint(10), Cl.uint(2025), Cl.none()], wallet1);
      
      const creditId1 = Cl.uint(1000000000);
      const creditId2 = Cl.uint(1000000001);
      
      const result = simnet.callPublicFn("greenstac", "retire-credits", [
        Cl.list([creditId1, creditId2]),
        Cl.stringUtf8("2025 Carbon Offsets"),
        Cl.none(),
        Cl.none()
      ], wallet1);
      
      expect(result.result).toBeOk(Cl.bool(true));
      
      // Status is RETIRED
      const credit = simnet.callReadOnlyFn("greenstac", "get-credit", [creditId1], wallet1);
      const val = credit.result as any;
      expect(val.value.data.status).toBeAscii("RETIRED");
      
      // Global ledger updated
      const globalLedger = simnet.callReadOnlyFn("greenstac", "get-global-retired-tonnes", [], wallet1);
      expect(globalLedger.result).toBeUint(2);
      
      // User's total retired updated
      const userTotal = simnet.callReadOnlyFn("greenstac", "get-total-retired-by", [Cl.principal(wallet1)], wallet1);
      expect(userTotal.result).toBeUint(2);
      
      // Batch retired amount updated
      const batch = simnet.callReadOnlyFn("greenstac", "get-batch", [Cl.uint(1)], wallet1);
      expect((batch.result as any).value.data["credits-retired"]).toBeUint(2);
      
      // Project retired amount updated
      const project = simnet.callReadOnlyFn("greenstac", "get-project", [Cl.uint(1)], wallet1);
      expect((project.result as any).value.data["total-retired"]).toBeUint(2);
    });

    it("prevents retirement of already retired credits", () => {
      // Setup
      simnet.callPublicFn("greenstac", "register-project", [Cl.stringUtf8("P1"), Cl.stringAscii("REDD+"), Cl.stringUtf8("C"), Cl.stringUtf8("M"), Cl.uint(100), Cl.stringUtf8("")], wallet1);
      simnet.callPublicFn("greenstac", "add-verifier", [Cl.principal(verifier), Cl.stringUtf8("V"), Cl.stringUtf8("A")], deployer);
      simnet.callPublicFn("greenstac", "verify-project", [Cl.uint(1), Cl.stringUtf8("")], verifier);
      simnet.callPublicFn("greenstac", "issue-credits", [Cl.uint(1), Cl.uint(10), Cl.uint(2025), Cl.none()], wallet1);
      simnet.callPublicFn("greenstac", "retire-credits", [Cl.list([Cl.uint(1000000000)]), Cl.stringUtf8("Offset"), Cl.none(), Cl.none()], wallet1);
      
      const result = simnet.callPublicFn("greenstac", "retire-credits", [
        Cl.list([Cl.uint(1000000000)]),
        Cl.stringUtf8("Offset again"),
        Cl.none(),
        Cl.none()
      ], wallet1);
      
      expect(result.result).toBeErr(Cl.uint(606)); // err-credit-already-retired
    });
  });

  describe("Dispute & Flagging System", () => {
    it("anyone can flag a project and suspend it", () => {
      // Setup
      simnet.callPublicFn("greenstac", "register-project", [Cl.stringUtf8("P1"), Cl.stringAscii("REDD+"), Cl.stringUtf8("C"), Cl.stringUtf8("M"), Cl.uint(100), Cl.stringUtf8("")], wallet1);
      simnet.callPublicFn("greenstac", "add-verifier", [Cl.principal(verifier), Cl.stringUtf8("V"), Cl.stringUtf8("A")], deployer);
      simnet.callPublicFn("greenstac", "verify-project", [Cl.uint(1), Cl.stringUtf8("")], verifier);
      
      // Flag project
      const result = simnet.callPublicFn("greenstac", "flag-project", [
        Cl.uint(1),
        Cl.stringUtf8("Suspicious activity detected")
      ], flagger);
      
      expect(result.result).toBeOk(Cl.bool(true));
      
      const project = simnet.callReadOnlyFn("greenstac", "get-project", [Cl.uint(1)], wallet1);
      expect((project.result as any).value.data.status).toBeAscii("SUSPENDED");
      
      const flagInfo = simnet.callReadOnlyFn("greenstac", "get-project-flags", [Cl.uint(1)], wallet1);
      expect(flagInfo.result).toBeSome(Cl.tuple({
        flagger: Cl.principal(flagger),
        reason: Cl.stringUtf8("Suspicious activity detected"),
        resolved: Cl.bool(false)
      }));
      
      // Cannot issue credits on suspended project
      const issueResult = simnet.callPublicFn("greenstac", "issue-credits", [Cl.uint(1), Cl.uint(10), Cl.uint(2025), Cl.none()], wallet1);
      expect(issueResult.result).toBeErr(Cl.uint(603)); // err-project-suspended
    });

    it("verifier can resolve a flag and restore project", () => {
      // Setup
      simnet.callPublicFn("greenstac", "register-project", [Cl.stringUtf8("P1"), Cl.stringAscii("REDD+"), Cl.stringUtf8("C"), Cl.stringUtf8("M"), Cl.uint(100), Cl.stringUtf8("")], wallet1);
      simnet.callPublicFn("greenstac", "add-verifier", [Cl.principal(verifier), Cl.stringUtf8("V"), Cl.stringUtf8("A")], deployer);
      simnet.callPublicFn("greenstac", "verify-project", [Cl.uint(1), Cl.stringUtf8("")], verifier);
      simnet.callPublicFn("greenstac", "flag-project", [Cl.uint(1), Cl.stringUtf8("Suspicious")], flagger);
      
      // Resolve flag
      const result = simnet.callPublicFn("greenstac", "resolve-flag", [
        Cl.uint(1),
        Cl.principal(flagger),
        Cl.stringUtf8("Investigation complete, all good")
      ], verifier);
      
      expect(result.result).toBeOk(Cl.bool(true));
      
      const project = simnet.callReadOnlyFn("greenstac", "get-project", [Cl.uint(1)], wallet1);
      expect((project.result as any).value.data.status).toBeAscii("VERIFIED");
      
      // Can issue credits again
      const issueResult = simnet.callPublicFn("greenstac", "issue-credits", [Cl.uint(1), Cl.uint(10), Cl.uint(2025), Cl.none()], wallet1);
      expect(issueResult.result).toBeOk(Cl.uint(1));
    });
  });
});
