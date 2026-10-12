"use server";

import { redirect } from "next/navigation";
import { run, type ActionResult } from "@/server/action";
import { bool, list, optNum, optStr, str } from "@/server/forms";
import { publicUrl, saveUpload, saveUploads } from "@/server/files";
import { invalid } from "@/server/errors";
import * as businesses from "@/server/services/businesses";
import * as catalogue from "@/server/services/catalogue";
import * as orders from "@/server/services/orders";
import * as community from "@/server/services/community";
import { parseMeasurementForm } from "@/server/services/measurements";

// Business portal actions. Ids come from hidden inputs; every service re-checks membership and role.

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const bizId = (fd: FormData) => str(fd, "businessId");
const orderId = (fd: FormData) => str(fd, "orderId");
const listingId = (fd: FormData) => str(fd, "listingId");
const memberRole = (fd: FormData) => (str(fd, "role") === "MANAGER" ? "MANAGER" : "STAFF");

// ── Registration, profile, verification ──

export async function createBusinessAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let id = "";
  const res = await run(async (actor) => {
    const input = {
      name: str(fd, "name"), kinds: list(fd, "kinds"), description: str(fd, "description"), phone: str(fd, "phone"), email: str(fd, "email"),
      address: str(fd, "address"), city: str(fd, "city"), lat: optNum(fd, "lat"), lng: optNum(fd, "lng"), registrationNumber: str(fd, "registrationNumber"),
    };
    // Check the form before storing any documents.
    businesses.businessSchema.parse(input);
    const docs = await saveUploads(actor, fd.getAll("documents"), { purpose: "VERIFICATION", allowPdf: true }, 5);
    id = (await businesses.createBusiness(actor, input, docs.map((d) => d.id))).id;
  });
  if (id) redirect(`/biz/${id}?created=1`);
  return res;
}

export async function updateProfileAction(_: ActionResult, fd: FormData) {
  return run(async (a) => {
    const hours: Record<string, string> = {};
    for (const d of DAYS) {
      const v = str(fd, `hours_${d}`);
      if (v) hours[d] = v;
    }
    await businesses.updateBusinessProfile(a, bizId(fd), {
      name: str(fd, "name"), kinds: list(fd, "kinds"), description: str(fd, "description"), phone: str(fd, "phone"), email: str(fd, "email"),
      address: str(fd, "address"), city: str(fd, "city"), lat: optNum(fd, "lat"), lng: optNum(fd, "lng"),
      serviceRadiusKm: Number(str(fd, "serviceRadiusKm")), capacityPerWeek: Number(str(fd, "capacityPerWeek")), offersWorkshopFitting: bool(fd, "offersWorkshopFitting"),
      skills: list(fd, "skills"), operatingHours: hours, payoutPhone: str(fd, "payoutPhone"),
    });
    return "Profile saved.";
  });
}

export async function addPortfolioPhotoAction(_: ActionResult, fd: FormData) {
  return run(async (a) => {
    const file = await saveUpload(a, fd.get("photo"), { purpose: "PORTFOLIO" });
    if (!file) throw invalid("Choose a photo to upload.");
    await businesses.addPortfolioPhoto(a, bizId(fd), publicUrl(file), str(fd, "caption"));
    return "Photo added.";
  });
}

export async function removePortfolioPhotoAction(_: ActionResult, fd: FormData) {
  return run(async (a) => { await businesses.removePortfolioPhoto(a, bizId(fd), str(fd, "photoId")); return "Photo removed."; });
}

export async function resubmitVerificationAction(_: ActionResult, fd: FormData) {
  return run(async (a) => {
    const docs = await saveUploads(a, fd.getAll("documents"), { purpose: "VERIFICATION", allowPdf: true }, 5);
    await businesses.resubmitVerification(a, bizId(fd), str(fd, "note"), docs.map((d) => d.id));
    return "Sent for review. We'll let you know the decision.";
  });
}

// ── Team ──

export async function addMemberAction(_: ActionResult, fd: FormData) {
  return run(async (a) => { await businesses.addMember(a, bizId(fd), str(fd, "email"), memberRole(fd)); return "Member added."; });
}
export async function changeMemberRoleAction(_: ActionResult, fd: FormData) {
  return run(async (a) => { await businesses.changeMemberRole(a, bizId(fd), str(fd, "membershipId"), memberRole(fd)); return "Role updated."; });
}
export async function removeMemberAction(_: ActionResult, fd: FormData) {
  return run(async (a) => { await businesses.removeMember(a, bizId(fd), str(fd, "membershipId")); return "Member removed."; });
}

// ── Styles ──

export async function setStyleOfferAction(_: ActionResult, fd: FormData) {
  return run(async (a) => {
    await businesses.setStyleOffer(a, bizId(fd), str(fd, "styleId"), { price: str(fd, "price"), daysToMake: Number(str(fd, "daysToMake")) });
    return "Saved.";
  });
}
export async function removeStyleOfferAction(_: ActionResult, fd: FormData) {
  return run(async (a) => { await businesses.removeStyleOffer(a, bizId(fd), str(fd, "styleId")); return "Removed from your styles."; });
}

export async function submitStyleAction(_: ActionResult, fd: FormData) {
  return run(async (a) => {
    const businessId = bizId(fd);
    const photo = await saveUpload(a, fd.get("photo"), { purpose: "STYLE" });
    await catalogue.createStyle(
      a,
      {
        name: str(fd, "name"), categoryId: str(fd, "categoryId"), wearer: str(fd, "wearer"), occasions: list(fd, "occasions"),
        description: str(fd, "description"), complexity: str(fd, "complexity"), indicativeLabour: optStr(fd, "indicativeLabour"),
        fabricYards: str(fd, "fabricYards"), measurementKeys: list(fd, "measurementKeys"), icon: optStr(fd, "icon"),
        imageUrl: photo ? publicUrl(photo) : null,
      },
      businessId,
    );
    return "Design submitted. It will appear in the catalogue after review.";
  });
}

// ── Inventory ──

export async function createListingAction(_: ActionResult, fd: FormData) {
  return run(async (a) => {
    const photos = await saveUploads(a, fd.getAll("photos"), { purpose: "FABRIC" }, 4);
    await catalogue.createListing(
      a,
      bizId(fd),
      {
        name: str(fd, "name"), fabricType: str(fd, "fabricType"), pattern: str(fd, "pattern"), color: str(fd, "color"), colorName: str(fd, "colorName"),
        unit: str(fd, "unit") === "METRE" ? "METRE" : "YARD", price: str(fd, "price"), quantity: str(fd, "quantity"), minOrder: optStr(fd, "minOrder"),
        widthInches: optNum(fd, "widthInches"), careNotes: str(fd, "careNotes"),
      },
      photos.map(publicUrl),
    );
    return "Fabric added.";
  });
}

export async function updateListingAction(_: ActionResult, fd: FormData) {
  return run(async (a) => {
    await catalogue.updateListing(a, listingId(fd), {
      price: str(fd, "price"), status: str(fd, "status") === "INACTIVE" ? "INACTIVE" : "ACTIVE", name: optStr(fd, "name"), careNotes: str(fd, "careNotes"),
    });
    return "Listing saved.";
  });
}

export async function changeStockAction(_: ActionResult, fd: FormData) {
  return run(async (a) => {
    const type = str(fd, "type") === "ADJUST" ? "ADJUST" : "RESTOCK";
    if (type === "RESTOCK" && str(fd, "change").startsWith("-")) throw invalid("A restock adds fabric. Use a correction to reduce stock.");
    await catalogue.changeStock(a, listingId(fd), { change: str(fd, "change"), type, note: str(fd, "note") });
    return "Stock updated.";
  });
}

export async function addListingPhotoAction(_: ActionResult, fd: FormData) {
  return run(async (a) => {
    const file = await saveUpload(a, fd.get("photo"), { purpose: "FABRIC" });
    if (!file) throw invalid("Choose a photo to upload.");
    await catalogue.addListingPhoto(a, listingId(fd), publicUrl(file));
    return "Photo added.";
  });
}

export async function removeListingAction(_: ActionResult, fd: FormData) {
  return run(async (a) => { await catalogue.removeListing(a, listingId(fd)); return "Listing deactivated. Customers no longer see it."; });
}

// ── Orders ──

function quoteInput(fd: FormData) {
  return {
    labour: str(fd, "labour"), fabricListingId: optStr(fd, "fabricListingId"), fabricQty: optStr(fd, "fabricQty"), otherAmount: optStr(fd, "otherAmount"),
    otherDescription: optStr(fd, "otherDescription"), discount: optStr(fd, "discount"), completionDate: str(fd, "completionDate"),
    depositPercent: optNum(fd, "depositPercent"), message: str(fd, "message"),
  };
}

export async function submitQuoteAction(_: ActionResult, fd: FormData) {
  return run(async (a) => { await orders.submitQuote(a, str(fd, "quotationId"), quoteInput(fd)); return "Quote sent to the customer."; });
}

export async function declineQuoteAction(_: ActionResult, fd: FormData) {
  return run(async (a) => { await orders.declineQuoteRequest(a, str(fd, "quotationId"), str(fd, "reason")); return "Request declined."; });
}

export async function fabricOrderRespondAction(_: ActionResult, fd: FormData) {
  return run(async (a) => {
    const confirm = str(fd, "decision") === "confirm";
    await orders.sellerRespondFabricOrder(a, orderId(fd), confirm, str(fd, "reason"));
    return confirm ? "Confirmed. The customer has been asked to pay." : "Order declined and the fabric released.";
  });
}

const ADVANCE = ["MEASUREMENTS_CONFIRMED", "AWAITING_MEASUREMENTS", "IN_PRODUCTION", "QUALITY_CHECK", "READY"] as const;
type Advance = (typeof ADVANCE)[number];

export async function advanceOrderAction(_: ActionResult, fd: FormData) {
  return run(async (a) => {
    const to = str(fd, "to");
    if (!ADVANCE.includes(to as Advance)) throw invalid("Choose a valid next step.");
    await orders.businessAdvance(a, orderId(fd), to as Advance, str(fd, "note"));
    return "Order updated.";
  });
}

export async function workshopMeasurementsAction(_: ActionResult, fd: FormData) {
  return run(async (a) => {
    const unit = str(fd, "unit") === "cm" ? "cm" : "in";
    await orders.recordWorkshopMeasurements(a, orderId(fd), parseMeasurementForm(fd, unit), str(fd, "notes"));
    return "Measurements saved and confirmed.";
  });
}

export async function proposeRevisionAction(_: ActionResult, fd: FormData) {
  return run(async (a) => {
    await orders.proposeRevision(a, orderId(fd), { ...quoteInput(fd), reason: str(fd, "reason") });
    return "Change sent. Nothing changes unless the customer approves it.";
  });
}

export async function markCollectedAction(_: ActionResult, fd: FormData) {
  return run(async (a) => { await orders.markCollected(a, orderId(fd), str(fd, "code")); return "Handed over. The customer has been asked to confirm."; });
}

export async function businessCancelOrderAction(_: ActionResult, fd: FormData) {
  return run(async (a) => {
    const reason = str(fd, "reason");
    if (!reason) throw invalid("Tell the customer why you're cancelling.");
    await orders.cancelOrder(a, orderId(fd), reason);
    return "Order cancelled.";
  });
}

// ── Reviews ──

export async function respondToReviewAction(_: ActionResult, fd: FormData) {
  return run(async (a) => { await community.respondToReview(a, str(fd, "reviewId"), str(fd, "response")); return "Response published."; });
}
