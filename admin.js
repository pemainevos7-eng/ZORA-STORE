
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";

import {
 getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";

import {
 getFirestore,collection,doc,addDoc,updateDoc,deleteDoc,
 onSnapshot,query,orderBy,serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";

import {
 getStorage,ref,uploadBytes,getDownloadURL,deleteObject
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-storage.js";

import {
 getFunctions,httpsCallable
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-functions.js";

import {firebaseConfig} from "./firebase-config.js";

const app=initializeApp(firebaseConfig);
const auth=getAuth(app);
const db=getFirestore(app);
const storage=getStorage(app);
const functions=getFunctions(app);

const adminSetOrderStatus=httpsCallable(functions,"adminSetOrderStatus");

const $=id=>document.getElementById(id);
const money=n=>new Intl.NumberFormat("id-ID",{
 style:"currency",currency:"IDR",maximumFractionDigits:0
}).format(Number(n)||0);

const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({
 "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));

let products=[];
let orders=[];
let unsubProducts=null;
let unsubOrders=null;
let currentAdmin=null;
let busy=false;

function errorText(e){
 const map={
 "auth/invalid-credential":"Email atau password salah.",
 "auth/too-many-requests":"Terlalu banyak percobaan. Coba lagi nanti.",
 "permission-denied":"Akses Firestore ditolak. Periksa Security Rules.",
 "storage/unauthorized":"Akses Firebase Storage ditolak.",
 "functions/unauthenticated":"Sesi admin berakhir. Silakan masuk kembali.",
 "functions/permission-denied":"Akun tidak memiliki izin admin."
 };
 return map[e.code]||e.message||"Terjadi kesalahan.";
}

function stopListeners(){
 if(unsubProducts)unsubProducts();
 if(unsubOrders)unsubOrders();
 unsubProducts=null;
 unsubOrders=null;
}

function showDashboard(user){
 $("loginScreen").style.display="none";
 $("dashboard").style.display="grid";
 $("adminEmail").textContent=user.email||"Administrator";
}

function showLogin(){
 $("dashboard").style.display="none";
 $("loginScreen").style.display="flex";
}

$("loginForm").addEventListener("submit",async e=>{
 e.preventDefault();
 $("loginBtn").disabled=true;
 $("error").textContent="Memeriksa akun...";
 try{
  await signInWithEmailAndPassword(
   auth,$("email").value.trim(),$("password").value
  );
 }catch(err){
  $("error").textContent=errorText(err);
 }finally{
  $("loginBtn").disabled=false;
 }
});

$("logout").onclick=async()=>{
 try{await signOut(auth)}catch(e){alert(errorText(e))}
};

onAuthStateChanged(auth,async user=>{
 stopListeners();
 currentAdmin=null;

 if(!user){
  showLogin();
  return;
 }

 try{
  const token=await user.getIdTokenResult(true);

  if(token.claims.admin!==true){
   $("error").textContent="Akun ini tidak memiliki akses administrator.";
   await signOut(auth);
   return;
  }

  currentAdmin=user;
  showDashboard(user);
  subscribeData();

 }catch(e){
  $("error").textContent=errorText(e);
  await signOut(auth);
 }
});

function subscribeData(){
 const pq=query(collection(db,"products"),orderBy("createdAt","desc"));
 unsubProducts=onSnapshot(pq,s=>{
  products=s.docs.map(d=>({id:d.id,...d.data()}));
  renderProducts();
  renderStats();
 },e=>alert("Produk: "+errorText(e)));

 const oq=query(collection(db,"orders"),orderBy("createdAt","desc"));
 unsubOrders=onSnapshot(oq,s=>{
  orders=s.docs.map(d=>({id:d.id,...d.data()}));
  renderOrders();
  renderStats();
 },e=>alert("Pesanan: "+errorText(e)));
}

function renderStats(){
 $("sProducts").textContent=products.length;
 $("sActive").textContent=products.filter(p=>p.active===true).length;
 $("sOrders").textContent=orders.length;
 $("sPending").textContent=orders.filter(o=>
  ["pending","waiting","awaiting_payment"].includes(o.status)
 ).length;
}

function renderProducts(){
 $("productRows").innerHTML=products.length?products.map(p=>`
 <tr>
  <td><div style="display:flex;align-items:center;gap:9px">
   <img src="${esc(p.imageUrl||"")}" alt="">
   <b>${esc(p.name)}</b>
  </div></td>
  <td>${esc(p.game)}</td>
  <td>${money(p.price)}</td>
  <td>${Number(p.stock)||0}</td>
  <td><span class="badge ${p.active?"green":"red"}">${p.active?"Aktif":"Nonaktif"}</span></td>
  <td><div class="actions">
   <button class="btn" data-edit="${esc(p.id)}">Edit</button>
   <button class="btn danger" data-delete="${esc(p.id)}">Hapus</button>
  </div></td>
 </tr>`).join(""):`<tr><td colspan="6" class="empty">Belum ada produk.</td></tr>`;

 $("productRows").querySelectorAll("[data-edit]").forEach(b=>{
  b.onclick=()=>editProduct(b.dataset.edit);
 });

 $("productRows").querySelectorAll("[data-delete]").forEach(b=>{
  b.onclick=()=>removeProduct(b.dataset.delete);
 });
}

function resetForm(){
 $("productForm").reset();
 $("editId").value="";
 $("pStock").value=1;
 $("pActive").value="true";
 $("formTitle").textContent="Tambah produk baru";
 $("saveProduct").textContent="SIMPAN PRODUK";
}

function editProduct(id){
 const p=products.find(x=>x.id===id);
 if(!p)return;

 $("editId").value=p.id;
 $("pName").value=p.name||"";
 $("pGame").value=p.game||"Free Fire";
 $("pPrice").value=p.price||"";
 $("pStock").value=p.stock??0;
 $("pDesc").value=p.description||"";
 $("pActive").value=String(p.active===true);

 $("formTitle").textContent="Edit produk";
 $("saveProduct").textContent="SIMPAN PERUBAHAN";

 $("productForm").scrollIntoView({behavior:"smooth",block:"start"});
}

$("cancelEdit").onclick=resetForm;

async function uploadImage(file){
 if(!file)return null;

 if(!["image/jpeg","image/png","image/webp"].includes(file.type))
  throw new Error("Format gambar tidak didukung.");

 if(file.size>5*1024*1024)
  throw new Error("Ukuran gambar maksimal 5 MB.");

 const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
 const path=`products/${crypto.randomUUID()}-${safeName}`;
 const imageRef=ref(storage,path);

 await uploadBytes(imageRef,file,{contentType:file.type});
 return {url:await getDownloadURL(imageRef),path};
}

$("productForm").addEventListener("submit",async e=>{
 e.preventDefault();
 if(!currentAdmin||busy)return;

 busy=true;
 const btn=$("saveProduct");
 btn.disabled=true;

 let uploaded=null;

 try{
  const id=$("editId").value;
  const old=products.find(p=>p.id===id);
  const file=$("pImage").files[0];

  if(file)uploaded=await uploadImage(file);

  const data={
   name:$("pName").value.trim(),
   game:$("pGame").value,
   price:Number($("pPrice").value),
   stock:Number($("pStock").value),
   description:$("pDesc").value.trim(),
   active:$("pActive").value==="true",
   updatedAt:serverTimestamp()
  };

  if(!data.name||!Number.isFinite(data.price)||data.price<1)
   throw new Error("Nama dan harga produk harus valid.");

  if(!Number.isInteger(data.stock)||data.stock<0)
   throw new Error("Stok tidak valid.");

  if(uploaded){
   data.imageUrl=uploaded.url;
   data.imagePath=uploaded.path;
  }else if(old){
   data.imageUrl=old.imageUrl||"";
   data.imagePath=old.imagePath||"";
  }else{
   data.imageUrl="";
   data.imagePath="";
  }

  if(id){
   await updateDoc(doc(db,"products",id),data);

   if(uploaded&&old?.imagePath){
    try{await deleteObject(ref(storage,old.imagePath))}catch{}
   }

   alert("Produk berhasil diperbarui.");
  }else{
   data.createdAt=serverTimestamp();
   await addDoc(collection(db,"products"),data);
   alert("Produk berhasil ditambahkan.");
  }

  resetForm();

 }catch(err){
  if(uploaded?.path){
   try{await deleteObject(ref(storage,uploaded.path))}catch{}
  }
  alert(errorText(err));
 }finally{
  busy=false;
  btn.disabled=false;
 }
});

async function removeProduct(id){
 if(!currentAdmin)return;

 const p=products.find(x=>x.id===id);
 if(!p)return;

 if(!confirm(`Hapus produk "${p.name}"?`))return;

 try{
  await deleteDoc(doc(db,"products",id));

  if(p.imagePath){
   try{await deleteObject(ref(storage,p.imagePath))}catch{}
  }

  if($("editId").value===id)resetForm();
  alert("Produk berhasil dihapus.");
 }catch(e){
  alert(errorText(e));
 }
}

function dateText(value){
 try{
  return value?.toDate?.().toLocaleString("id-ID")||"Baru";
 }catch{return "Baru"}
}

function renderOrders(){
 const rows=orders.map(o=>`
 <tr>
  <td><b>${esc(o.id.slice(0,12))}</b></td>
  <td>${esc(o.buyerEmail||o.buyerUid||"Pelanggan")}</td>
  <td>${money(o.total)}</td>
  <td><span class="badge">${esc(o.status||"unknown")}</span></td>
  <td>${esc(dateText(o.createdAt))}</td>
  <td>
   ${o.status==="pending"?`<button class="btn primary" data-process="${esc(o.id)}">Proses</button>`:"—"}
  </td>
 </tr>`).join("");

 $("orderRows").innerHTML=rows||'<tr><td colspan="6" class="empty">Belum ada pesanan.</td></tr>';

 $("orderRows").querySelectorAll("[data-process]").forEach(b=>{
  b.onclick=()=>processOrder(b.dataset.process,b);
 });

 $("recentOrders").innerHTML=orders.length?`
 <div class="tablewrap"><table>
 <thead><tr><th>ID</th><th>Total</th><th>Status</th><th>Tanggal</th></tr></thead>
 <tbody>${orders.slice(0,5).map(o=>`
 <tr>
  <td>${esc(o.id.slice(0,12))}</td>
  <td>${money(o.total)}</td>
  <td><span class="badge">${esc(o.status)}</span></td>
  <td>${esc(dateText(o.createdAt))}</td>
 </tr>`).join("")}</tbody>
 </table></div>`:'<div class="empty">Belum ada pesanan.</div>';
}

async function processOrder(id,button){
 if(!currentAdmin)return;

 if(!confirm("Pastikan pembayaran sudah diverifikasi. Lanjutkan memproses pesanan?"))return;

 button.disabled=true;

 try{
  await adminSetOrderStatus({
   orderId:id,
   status:"processing"
  });
  alert("Status pesanan berhasil diperbarui.");
 }catch(e){
  alert(errorText(e));
 }finally{
  button.disabled=false;
 }
}

function navigate(page){
 document.querySelectorAll(".section").forEach(s=>s.classList.remove("active"));
 document.querySelectorAll("[data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
 $(page).classList.add("active");

 $("pageTitle").textContent={
  overview:"Overview",
  products:"Manajemen Produk",
  orders:"Manajemen Pesanan"
 }[page];
}

document.querySelectorAll("[data-page]").forEach(b=>{
 b.onclick=()=>navigate(b.dataset.page);
});

document.querySelectorAll("[data-goto]").forEach(b=>{
 b.onclick=()=>navigate(b.dataset.goto);
});

$("refresh").onclick=()=>{
 if(!currentAdmin)return;
 renderProducts();
 renderOrders();
 renderStats();
};

resetForm();
