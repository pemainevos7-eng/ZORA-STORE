const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();

exports.createOrder = onCall({ region: "asia-southeast1", enforceAppCheck: false }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Silakan masuk terlebih dahulu.");
  const items = request.data?.items;
  if (!Array.isArray(items) || items.length < 1 || items.length > 10) {
    throw new HttpsError("invalid-argument", "Daftar produk tidak valid.");
  }
  const ids = items.map(x => x && x.productId);
  if (ids.some(id => typeof id !== "string" || id.length < 1 || id.length > 150) || new Set(ids).size !== ids.length) {
    throw new HttpsError("invalid-argument", "Produk duplikat atau ID tidak valid.");
  }

  const orderRef = db.collection("orders").doc();
  const result = await db.runTransaction(async tx => {
    const refs = ids.map(id => db.collection("products").doc(id));
    const snaps = [];
    for (const ref of refs) snaps.push(await tx.get(ref));

    const orderItems = [];
    let total = 0;
    for (let i = 0; i < snaps.length; i++) {
      if (!snaps[i].exists) throw new HttpsError("not-found", "Produk tidak ditemukan.");
      const p = snaps[i].data();
      if (p.active !== true || !Number.isInteger(p.stock) || p.stock < 1) {
        throw new HttpsError("failed-precondition", "Produk sedang tidak tersedia.");
      }
      if (!Number.isInteger(p.price) || p.price < 1 || p.price > 100000000) {
        throw new HttpsError("failed-precondition", "Harga produk tidak valid.");
      }
      total += p.price;
      if (!Number.isSafeInteger(total) || total > 500000000) {
        throw new HttpsError("failed-precondition", "Total pesanan melewati batas.");
      }
      orderItems.push({
        productId: ids[i],
        name: String(p.name).slice(0, 90),
        game: String(p.game || "").slice(0, 40),
        unitPrice: p.price,
        quantity: 1
      });
    }
    for (let i = 0; i < refs.length; i++) {
      tx.update(refs[i], { stock: snaps[i].data().stock - 1, updatedAt: FieldValue.serverTimestamp() });
    }
    tx.create(orderRef, {
      buyerUid: request.auth.uid,
      buyerEmail: request.auth.token.email || null,
      items: orderItems,
      total,
      status: "pending",
      paymentStatus: "unpaid",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    return { total };
  });

  return { orderId: orderRef.id, total: result.total, status: "pending" };
});

exports.adminSetOrderStatus = onCall({ region: "asia-southeast1" }, async (request) => {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "Admin diperlukan.");
  }
  const { orderId, status } = request.data || {};
  const allowed = ["pending", "paid", "processing", "completed", "cancelled"];
  if (typeof orderId !== "string" || !allowed.includes(status)) {
    throw new HttpsError("invalid-argument", "Data status tidak valid.");
  }
  const ref = db.collection("orders").doc(orderId);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Pesanan tidak ditemukan.");
    const order = snap.data();
    const old = order.status;
    if (old === "completed" || old === "cancelled") {
      throw new HttpsError("failed-precondition", "Pesanan sudah ditutup.");
    }
    // Restore reserved stock when cancelling an unpaid/pending order.
    if (status === "cancelled" && old === "pending") {
      const productRefs = (order.items || []).map(item => db.collection("products").doc(item.productId));
      const productSnaps = [];
      for (const productRef of productRefs) productSnaps.push(await tx.get(productRef));
      for (let i = 0; i < productRefs.length; i++) {
        if (productSnaps[i].exists) {
          tx.update(productRefs[i], {
            stock: (Number(productSnaps[i].data().stock) || 0) + Number(order.items[i].quantity || 1),
            updatedAt: FieldValue.serverTimestamp()
          });
        }
      }
    }
    tx.update(ref, {
      status,
      paymentStatus: status === "paid" || status === "processing" || status === "completed" ? "paid" : order.paymentStatus,
      updatedAt: FieldValue.serverTimestamp()
    });
  });
  return { success: true };
});
