# ZORA STORE — Firebase Marketplace

## Included
- Firebase Authentication email/password
- Firestore live product catalog
- Firebase Storage product images
- Cloud Function creates orders using server-side product prices and stock transactions
- Custom-claim protected admin product management
- Firestore and Storage Security Rules
- Dark responsive storefront

## Important production notes
This is a deployable application starter, not an already deployed store. You must connect your own Firebase project, deploy rules/functions/hosting, test with the Firebase Emulator Suite, and configure App Check before public launch.

No payment gateway is connected. Orders are real Firestore records with `pending` status. Do not mark an order paid until payment has been independently verified. Configure a payment provider through its official server-side integration before accepting automated payments.

Do not store game-account passwords, recovery codes, or other account secrets in public product documents. Account transfers may be prohibited by individual game publishers; review each game's terms and obtain adult/guardian oversight for any real commercial operation.

## 1. Firebase setup
1. Create a Firebase project at https://console.firebase.google.com/
2. Add a Web App and copy its config into `firebase-config.js`.
3. Enable Authentication > Sign-in method > Email/Password.
4. Create a Cloud Firestore database in production mode.
5. Enable Cloud Storage.
6. Install Node.js 20 and Firebase CLI: `npm install -g firebase-tools`.
7. Copy `.firebaserc.example` to `.firebaserc` and replace project ID.
8. Install root dependencies: `npm install`.
9. Install function dependencies: `cd functions && npm install && cd ..`.
10. Login: `firebase login`.
11. Deploy: `firebase deploy`.

## 2. Create the first admin
1. Register your admin account from the website.
2. In Firebase Console > Project settings > Service accounts, generate a private key.
3. Save it locally as `service-account.json` in the project root. Never commit it or upload it to hosting.
4. Run: `node scripts/set-admin.js your-admin@email.com`.
5. Sign out and sign in again. Admin menu should appear.

For a real business, have a responsible adult own and manage merchant/payment accounts and the service-account credentials.

## 3. Indexes
Firestore may request a composite index for `products(active, createdAt desc)` and `orders(buyerUid, createdAt desc)`. Follow the index-creation link in the Firebase error, or add indexes in Firebase Console.

## 4. App Check
Before public launch, register the web app in Firebase App Check and enforce App Check for Firestore, Storage, and callable Functions after testing. The sample callable function has enforcement disabled to allow initial setup.

## 5. Hosting
The root `index.html`, `app.js`, and `firebase-config.js` are hosted by Firebase Hosting. You can also deploy the same static site to another host, but deploy Firebase rules and functions separately.

## 6. Limitations to finish before public launch
- Connect a legitimate payment gateway using server-side verification/webhooks.
- Add customer support and order cancellation/refund workflows.
- Add a private, authenticated account-delivery workflow; never expose game login details in public product records.
- Add privacy policy, terms, contact details, and applicable business/legal review.
- Test Security Rules and Cloud Functions with Firebase Emulator Suite.
