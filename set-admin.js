// Jalankan sekali di komputer tepercaya setelah membuat akun admin melalui website.
// Jangan unggah service-account.json ke GitHub atau hosting publik.
const admin = require("firebase-admin");
const serviceAccount = require("../service-account.json");
const email = process.argv[2];
if (!email) throw new Error("Gunakan: node scripts/set-admin.js admin@email.com");
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
(async () => {
  const user = await admin.auth().getUserByEmail(email);
  await admin.auth().setCustomUserClaims(user.uid, { admin: true });
  console.log(`Custom claim admin diberikan kepada ${email}. Logout lalu login kembali.`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
