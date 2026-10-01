const express=require("express");
const path=require("path");
const bcrypt=require("bcryptjs");
const jwt=require("jsonwebtoken");
const Database=require("sqlite3");

const app=express();
const PORT=process.env.PORT||3000;
const SECRET=process.env.JWT_SECRET||"CHANGE_ME_IN_PRODUCTION";
const db=new Database(process.env.DB_FILE||"shri_ram_fresh.db");
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 email TEXT UNIQUE NOT NULL,
 password_hash TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('owner','customer')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS products(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 category TEXT NOT NULL,
 price REAL NOT NULL,
 unit TEXT NOT NULL,
 benefit TEXT NOT NULL DEFAULT '',
 active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS offers(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 title TEXT NOT NULL,
 details TEXT NOT NULL DEFAULT '',
 active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS orders(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 order_no TEXT UNIQUE NOT NULL,
 customer_id INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'Waiting',
 payment_method TEXT NOT NULL,
 payment_status TEXT NOT NULL DEFAULT 'Pending',
 pickup_time TEXT NOT NULL,
 subtotal REAL NOT NULL,
 roundoff REAL NOT NULL,
 total REAL NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(customer_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS order_items(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 order_id INTEGER NOT NULL,
 product_id INTEGER NOT NULL,
 name TEXT NOT NULL,
 qty REAL NOT NULL,
 unit TEXT NOT NULL,
 price REAL NOT NULL,
 FOREIGN KEY(order_id) REFERENCES orders(id)
);
`);

function seed(){
  const ownerEmail=process.env.OWNER_EMAIL||"owner@shriramfresh.local";
  const ownerPassword=process.env.OWNER_PASSWORD||"ChangeMe123!";
  const count=db.prepare("SELECT COUNT(*) c FROM users WHERE role='owner'").get().c;
  if(!count) db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,'owner')")
    .run("Shri Ram Fresh Owner",ownerEmail,bcrypt.hashSync(ownerPassword,10));
  const pcount=db.prepare("SELECT COUNT(*) c FROM products").get().c;
  if(!pcount){
    const items=[
      ["Onion","Vegetables",30,"kg","Provides antioxidants and vitamin C; useful as part of a balanced diet."],
      ["Potato","Vegetables",28,"kg","Provides carbohydrates, potassium and vitamin C."],
      ["Tomato","Vegetables",40,"kg","A source of vitamin C and lycopene."],
      ["Cabbage","Vegetables",35,"kg","Provides vitamin C, vitamin K and dietary fiber."],
      ["Carrot","Vegetables",50,"kg","Rich in beta-carotene, which the body can convert to vitamin A."],
      ["Apple","Fruits",120,"kg","Provides fiber and vitamin C."],
      ["Banana","Fruits",50,"dozen","Provides carbohydrates, vitamin B6 and potassium."],
      ["Orange","Fruits",90,"kg","A good source of vitamin C and water."],
      ["Papaya","Fruits",70,"kg","Provides vitamin C, vitamin A and dietary fiber."],
      ["Milk","Dairy",60,"litre","Provides protein and calcium."],
      ["Curd","Dairy",70,"kg","Provides protein and calcium; live-culture products may contain beneficial bacteria."],
      ["Paneer","Dairy",320,"kg","A protein- and calcium-containing dairy food."]
    ];
    const s=db.prepare("INSERT INTO products(name,category,price,unit,benefit) VALUES(?,?,?,?,?)");
    const tx=db.transaction(rows=>rows.forEach(r=>s.run(...r))); tx(items);
  }
}
seed();

app.use(express.json({limit:"1mb"}));
app.use(express.static(path.join(__dirname,"public")));

function auth(req,res,next){
  const h=req.headers.authorization||"";
  if(!h.startsWith("Bearer ")) return res.status(401).json({error:"Login required"});
  try{req.user=jwt.verify(h.slice(7),SECRET);next()}catch(e){res.status(401).json({error:"Session expired"})}
}
function owner(req,res,next){auth(req,res,()=>req.user.role==="owner"?next():res.status(403).json({error:"Owner access required"}))}
function makeToken(u){return jwt.sign({id:u.id,name:u.name,email:u.email,role:u.role},SECRET,{expiresIn:"30d"})}

app.post("/api/auth/register",(req,res)=>{
  const {name,email,password}=req.body||{};
  if(!name||!email||!password||password.length<6)return res.status(400).json({error:"Enter name, email and a password of at least 6 characters."});
  try{
    const r=db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,'customer')").run(name,email.toLowerCase(),bcrypt.hashSync(password,10));
    const u=db.prepare("SELECT id,name,email,role FROM users WHERE id=?").get(r.lastInsertRowid);
    res.json({token:makeToken(u),user:u});
  }catch(e){res.status(400).json({error:"That email is already registered."})}
});
app.post("/api/auth/login",(req,res)=>{
  const {email,password}=req.body||{}; const u=db.prepare("SELECT * FROM users WHERE email=?").get((email||"").toLowerCase());
  if(!u||!bcrypt.compareSync(password||"",u.password_hash))return res.status(401).json({error:"Invalid email or password"});
  res.json({token:makeToken(u),user:{id:u.id,name:u.name,email:u.email,role:u.role}});
});

app.get("/api/products",(req,res)=>res.json(db.prepare("SELECT * FROM products WHERE active=1 ORDER BY category,name").all()));
app.get("/api/offer",(req,res)=>res.json(db.prepare("SELECT * FROM offers WHERE active=1 ORDER BY id DESC LIMIT 1").get()||null));

app.post("/api/orders",auth,(req,res)=>{
  if(req.user.role!=="customer")return res.status(403).json({error:"Customer account required"});
  const {items,payment_method,pickup_time}=req.body||{};
  if(!Array.isArray(items)||!items.length)return res.status(400).json({error:"Basket is empty"});
  if(payment_method && payment_method !== "cash")return res.status(400).json({error:"This shop uses Pay at Store only."});
  const ids=items.map(x=>Number(x.product_id)).filter(Boolean);
  const placeholders=ids.map(()=>"?").join(",");
  const products=db.prepare(`SELECT * FROM products WHERE active=1 AND id IN (${placeholders})`).all(...ids);
  const map=new Map(products.map(p=>[p.id,p]));
  let subtotal=0,clean=[];
  for(const x of items){
    const p=map.get(Number(x.product_id)); const qty=Number(x.qty);
    if(!p||!Number.isFinite(qty)||qty<=0)continue;
    const line=p.price*qty; subtotal+=line; clean.push({p,qty});
  }
  if(!clean.length)return res.status(400).json({error:"No valid items"});
  const total=Math.round(subtotal), roundoff=total-subtotal;
  const orderNo="SRF-"+Math.floor(100000+Math.random()*900000);
  const tx=db.transaction(()=>{
    const o=db.prepare(`INSERT INTO orders(order_no,customer_id,payment_method,pickup_time,subtotal,roundoff,total)
      VALUES(?,?,?,?,?,?,?)`).run(orderNo,req.user.id,"cash",pickup_time||"As soon as ready",subtotal,roundoff,total);
    const s=db.prepare("INSERT INTO order_items(order_id,product_id,name,qty,unit,price) VALUES(?,?,?,?,?,?)");
    clean.forEach(x=>s.run(o.lastInsertRowid,x.p.id,x.p.name,x.qty,x.p.unit,x.p.price));
  });
  tx();
  res.json({order_no:orderNo,total,status:"Waiting",payment_status:"Pending"});
});

app.get("/api/orders/me",auth,(req,res)=>{
  const rows=db.prepare(`SELECT o.*, COALESCE(json_group_array(json_object('name',i.name,'qty',i.qty,'unit',i.unit,'price',i.price)),'[]') items
    FROM orders o LEFT JOIN order_items i ON i.order_id=o.id
    WHERE o.customer_id=? GROUP BY o.id ORDER BY o.id DESC LIMIT 20`).all(req.user.id);
  rows.forEach(r=>{try{r.items=JSON.parse(r.items)}catch(e){r.items=[]}});
  res.json(rows);
});

app.get("/api/owner/orders",owner,(req,res)=>{
  const rows=db.prepare(`SELECT o.*,u.name customer_name,u.email customer_email,
    COALESCE(json_group_array(json_object('name',i.name,'qty',i.qty,'unit',i.unit,'price',i.price)),'[]') items
    FROM orders o JOIN users u ON u.id=o.customer_id LEFT JOIN order_items i ON i.order_id=o.id
    GROUP BY o.id ORDER BY CASE o.status WHEN 'Waiting' THEN 1 WHEN 'Preparing' THEN 2 WHEN 'Ready' THEN 3 ELSE 4 END,o.id DESC`).all();
  rows.forEach(r=>{try{r.items=JSON.parse(r.items)}catch(e){r.items=[]}});
  res.json(rows);
});
app.patch("/api/owner/orders/:id",owner,(req,res)=>{
  const {status,payment_status}=req.body||{};
  const allowed=["Waiting","Preparing","Ready","Completed"];
  if(status&&!allowed.includes(status))return res.status(400).json({error:"Invalid status"});
  if(payment_status&&!["Pending","Paid"].includes(payment_status))return res.status(400).json({error:"Invalid payment status"});
  db.prepare("UPDATE orders SET status=COALESCE(?,status),payment_status=COALESCE(?,payment_status) WHERE id=?").run(status||null,payment_status||null,req.params.id);
  res.json({ok:true});
});
app.post("/api/owner/products",owner,(req,res)=>{
  const {name,category,price,unit,benefit}=req.body||{};
  if(!name||!category||!price||!unit)return res.status(400).json({error:"Name, category, price and unit are required"});
  const r=db.prepare("INSERT INTO products(name,category,price,unit,benefit) VALUES(?,?,?,?,?)").run(name,category,Number(price),unit,benefit||"Fresh food that can be part of a balanced diet.");
  res.json(db.prepare("SELECT * FROM products WHERE id=?").get(r.lastInsertRowid));
});
app.patch("/api/owner/products/:id",owner,(req,res)=>{
  const {price,active}=req.body||{};
  db.prepare("UPDATE products SET price=COALESCE(?,price),active=COALESCE(?,active) WHERE id=?")
    .run(price==null?null:Number(price),active==null?null:(active?1:0),req.params.id);
  res.json({ok:true});
});
app.post("/api/owner/offers",owner,(req,res)=>{
  const {title,details}=req.body||{};
  if(!title)return res.status(400).json({error:"Offer title is required"});
  db.prepare("UPDATE offers SET active=0 WHERE active=1").run();
  const r=db.prepare("INSERT INTO offers(title,details,active) VALUES(?,?,1)").run(title,details||"");
  res.json(db.prepare("SELECT * FROM offers WHERE id=?").get(r.lastInsertRowid));
});

app.get("/*splat",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`Shri Ram Fresh running on port ${PORT}`));
