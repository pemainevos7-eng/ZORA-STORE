import { initializeApp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, sendPasswordResetEmail,
  updateProfile
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-storage.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-functions.js";
import { firebaseConfig } from "./firebase-config.js";

const $ = id => document.getElementById(id);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app);
const createOrder = httpsCallable(functions, "createOrder");
const adminSetOrderStatus = httpsCallable(functions, "adminSetOrderStatus");
let currentUser = null, isAdmin = false, products = [], cart = [], category = "Semua", authMode = "login";
let unsubProducts, unsubOrders, unsubAdminOrders;
const money = n => new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(n || 0);
const esc = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const show = id => $(id).classList.add("show");
const hide = id => $(id).classList.remove("show");
document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>hide(b.dataset.close)));
document.querySelectorAll(".overlay").forEach(o=>o.addEventListener("click",e=>{if(e.target===o)o.classList.remove("show")}));

function message(id,text){$(id).textContent=text}
function setAuthMode(mode){
  authMode=mode; $("authTitle").textContent=mode==="login"?"Masuk ke ZORA STORE":"Buat akun ZORA STORE";
  $("nameField").hidden=mode==="login"; $("authSubmit").textContent=mode==="login"?"Masuk":"Daftar";
  $("loginTab").classList.toggle("primary",mode==="login"); $("registerTab").classList.toggle("primary",mode==="register");
  message("authMessage","");
}
$("authOpen").onclick=()=>{setAuthMode("login");show("authModal")};
$("loginTab").onclick=()=>setAuthMode("login");
$("registerTab").onclick=()=>setAuthMode("register");
$("authForm").addEventListener("submit",async e=>{
  e.preventDefault(); const email=$("authEmail").value.trim(), password=$("authPassword").value;
  $("authSubmit").disabled=true; message("authMessage","Memproses...");
  try{
    if(authMode==="register"){
      const name=$("authName").value.trim(); if(!name)throw new Error("Nama wajib diisi.");
      const cred=await createUserWithEmailAndPassword(auth,email,password);
      await updateProfile(cred.user,{displayName:name});
      await addDoc(collection(db,"profiles"),{uid:cred.user.uid,name,email,createdAt:serverTimestamp()});
    }else await signInWithEmailAndPassword(auth,email,password);
    hide("authModal");
  }catch(err){message("authMessage",friendlyError(err))}
  finally{$("authSubmit").disabled=false}
});
$("resetPassword").onclick=async()=>{
  const email=$("authEmail").value.trim(); if(!email)return message("authMessage","Isi email terlebih dahulu.");
  try{await sendPasswordResetEmail(auth,email);message("authMessage","Email reset password dikirim jika alamat terdaftar.");}
  catch(e){message("authMessage",friendlyError(e))}
};
function friendlyError(e){
 const map={"auth/email-already-in-use":"Email sudah digunakan.","auth/invalid-email":"Format email tidak valid.","auth/weak-password":"Password minimal 6 karakter.","auth/invalid-credential":"Email atau password salah.","permission-denied":"Akses ditolak oleh Security Rules.","functions/failed-precondition":"Produk tidak tersedia atau stok berubah.","functions/unauthenticated":"Silakan masuk terlebih dahulu."};
 return map[e.code] || e.message || "Terjadi kesalahan.";
}
onAuthStateChanged(auth,async user=>{
 currentUser=user;
 if(user){
   const token=await user.getIdTokenResult(true); isAdmin=token.claims.admin===true;
   $("authOpen").textContent=user.displayName || "Akun";
   $("authOpen").onclick=()=>{loadMyOrders();show("ordersModal")};
   $("adminOpen").hidden=!isAdmin;
   $("authOpen").onclick=()=>show("ordersModal");
 }else{
   isAdmin=false;$("authOpen").textContent="Masuk";$("adminOpen").hidden=true;
   $("authOpen").onclick=()=>{setAuthMode("login");show("authModal")};
 }
 renderProducts();
});
function subscribeProducts(){
 if(unsubProducts)unsubProducts();
 const q=query(collection(db,"products"),where("active","==",true),orderBy("createdAt","desc"));
 unsubProducts=onSnapshot(q,snap=>{
   products=snap.docs.map(d=>({id:d.id,...d.data()}));renderProducts();
 },err=>{$("products").innerHTML=`<div class="empty">Katalog gagal dimuat: ${esc(friendlyError(err))}</div>`});
}
subscribeProducts();

function renderProducts(){
 const search=$("search").value.trim().toLowerCase(), sort=$("sort").value;
 let list=products.filter(p=>(category==="Semua"||p.game===category)&&
  (!search||(p.name+" "+p.game+" "+(p.description||"")).toLowerCase().includes(search)));
 if(sort==="low")list.sort((a,b)=>a.price-b.price);
 if(sort==="high")list.sort((a,b)=>b.price-a.price);
 $("productCount").textContent=products.length;
 $("resultCount").textContent=`Menampilkan ${list.length} produk`;
 $("products").innerHTML=list.length?list.map(p=>`
 <article class="product">
  <img src="${esc(p.imageUrl||"")}" alt="${esc(p.name)}" loading="lazy" onerror="this.style.visibility='hidden'">
  <div class="pbody"><div class="game">${esc(p.game)}</div><h3>${esc(p.name)}</h3>
  <div class="meta">${Number(p.stock||0)>0?`Stok ${Number(p.stock)}`:"Stok habis"}</div>
  <div class="price">${money(p.price)}</div>
  <div class="pactions"><button class="btn" data-detail="${p.id}">Detail</button><button class="btn primary" data-add="${p.id}" ${Number(p.stock||0)<1?"disabled":""}>Tambah</button></div>
  </div></article>`).join(""):`<div class="empty">Belum ada produk yang cocok.</div>`;
 $("products").querySelectorAll("[data-detail]").forEach(b=>b.onclick=()=>detail(b.dataset.detail));
 $("products").querySelectorAll("[data-add]").forEach(b=>b.onclick=()=>addCart(b.dataset.add));
}
$("search").addEventListener("input",renderProducts);$("sort").addEventListener("change",renderProducts);
$("cats").addEventListener("click",e=>{const b=e.target.closest("[data-cat]");if(!b)return;category=b.dataset.cat;document.querySelectorAll(".cat").forEach(x=>x.classList.toggle("active",x===b));renderProducts()});

function detail(id){
 const p=products.find(x=>x.id===id);if(!p)return;
 $("detailBody").innerHTML=`<img src="${esc(p.imageUrl||"")}" style="width:100%;height:190px;object-fit:cover;border-radius:8px" alt="">
 <div class="eyebrow" style="margin-top:14px">${esc(p.game)}</div><h2 style="margin:8px 0">${esc(p.name)}</h2>
 <div class="price">${money(p.price)}</div><p class="muted">${esc(p.description||"Tidak ada deskripsi.")}</p>
 <p class="muted">Stok tersedia: ${Number(p.stock||0)}</p>
 <button class="btn primary" id="detailAdd" style="width:100%" ${Number(p.stock||0)<1?"disabled":""}>TAMBAH KE KERANJANG</button>`;
 $("detailAdd").onclick=()=>{addCart(id);hide("detailModal")};show("detailModal");
}
function addCart(id){
 const p=products.find(x=>x.id===id);if(!p||p.stock<1)return;
 if(cart.some(x=>x.id===id))return alert("Produk ini sudah ada di keranjang. Satu listing hanya dapat dipesan satu kali.");
 cart.push({id:p.id,name:p.name,price:p.price,imageUrl:p.imageUrl||"",game:p.game});renderCart();
}
function renderCart(){
 $("cartCount").textContent=cart.length;
 $("cartBody").innerHTML=cart.length?cart.map((p,i)=>`<div class="item"><img src="${esc(p.imageUrl)}" alt=""><div class="grow"><strong>${esc(p.name)}</strong><p>${money(p.price)}</p></div><button class="btn" data-remove="${i}">Hapus</button></div>`).join(""):`<div class="empty">Keranjang masih kosong.</div>`;
 $("cartTotal").textContent=money(cart.reduce((s,p)=>s+p.price,0));
 $("cartBody").querySelectorAll("[data-remove]").forEach(b=>b.onclick=()=>{cart.splice(Number(b.dataset.remove),1);renderCart()});
 $("checkoutBtn").disabled=!cart.length;
}
$("cartOpen").onclick=()=>{renderCart();show("cartModal")};
$("checkoutBtn").onclick=async()=>{
 if(!currentUser){hide("cartModal");setAuthMode("login");show("authModal");return}
 if(!cart.length)return;
 $("checkoutBtn").disabled=true;
 try{
  const result=await createOrder({items:cart.map(p=>({productId:p.id}))});
  cart=[];renderCart();hide("cartModal");
  alert(`Pesanan berhasil dibuat.\nID: ${result.data.orderId}\nTotal: ${money(result.data.total)}\nStatus: Menunggu konfirmasi.`);
  loadMyOrders();
 }catch(e){alert(friendlyError(e))}
 finally{$("checkoutBtn").disabled=false}
};
async function loadMyOrders(){
 if(!currentUser)return;
 const q=query(collection(db,"orders"),where("buyerUid","==",currentUser.uid),orderBy("createdAt","desc"));
 onSnapshot(q,s=>{$("ordersBody").innerHTML=s.empty?'<p class="muted">Belum ada pesanan.</p>':s.docs.map(d=>{const x=d.data();return `<div class="adminline"><span><b>${esc(d.id.slice(0,10))}</b><br>${money(x.total)} · ${esc(x.status)}</span><span>${esc(x.createdAt?.toDate?.().toLocaleDateString("id-ID")||"Baru")}</span></div>`}).join("")});
}
$("adminOpen").onclick=()=>{if(!isAdmin)return;show("adminModal");subscribeAdmin()};
function subscribeAdmin(){
 const q=query(collection(db,"products"),orderBy("createdAt","desc"));
 if(window.unsubAdminProducts)window.unsubAdminProducts();
 window.unsubAdminProducts=onSnapshot(q,s=>{
  $("adminProducts").innerHTML=s.empty?'<p class="muted">Belum ada produk.</p>':s.docs.map(d=>{const p=d.data();return `<div class="adminline"><span>${esc(p.name)} · ${money(p.price)} · stok ${p.stock}</span><button data-del="${d.id}">Hapus</button></div>`}).join("");
  $("adminProducts").querySelectorAll("[data-del]").forEach(b=>b.onclick=async()=>{if(confirm("Hapus produk ini?"))try{await deleteDoc(doc(db,"products",b.dataset.del))}catch(e){alert(friendlyError(e))}});
 });
 const oq=query(collection(db,"orders"),orderBy("createdAt","desc"));
 if(unsubAdminOrders)unsubAdminOrders();
 unsubAdminOrders=onSnapshot(oq,s=>{
  $("adminOrders").innerHTML=s.empty?'<p class="muted">Belum ada pesanan.</p>':s.docs.map(d=>{const o=d.data();return `<div class="adminline"><span><b>${esc(d.id.slice(0,10))}</b> · ${money(o.total)}<br>${esc(o.status)}</span><button data-status="${d.id}">Tandai diproses</button></div>`}).join("");
  $("adminOrders").querySelectorAll("[data-status]").forEach(b=>b.onclick=async()=>{
    if(!confirm("Tandai pesanan ini sedang diproses? Pastikan pembayaran sudah diverifikasi terlebih dahulu."))return;
    b.disabled=true;
    try{await adminSetOrderStatus({orderId:b.dataset.status,status:"processing"});alert("Status pesanan diperbarui.");}
    catch(e){alert(friendlyError(e));}
    finally{b.disabled=false;}
  });
 });
}
$("productForm").addEventListener("submit",async e=>{
 e.preventDefault();if(!isAdmin)return alert("Akses admin diperlukan.");
 const btn=e.submitter;btn.disabled=true;
 try{
  let imageUrl="";
  const file=$("pImage").files[0];
  if(file){
   if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>5*1024*1024)throw new Error("Gambar harus JPG/PNG/WebP dan maksimal 5 MB.");
   const path=`products/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
   const r=ref(storage,path);await uploadBytes(r,file,{contentType:file.type});imageUrl=await getDownloadURL(r);
  }
  await addDoc(collection(db,"products"),{
   name:$("pName").value.trim(),game:$("pGame").value,price:Number($("pPrice").value),
   stock:Number($("pStock").value),description:$("pDesc").value.trim(),imageUrl,
   active:true,createdAt:serverTimestamp(),updatedAt:serverTimestamp()
  });
  e.target.reset();alert("Produk berhasil disimpan ke Firestore.");
 }catch(err){alert(friendlyError(err))}
 finally{btn.disabled=false}
});
renderCart();
