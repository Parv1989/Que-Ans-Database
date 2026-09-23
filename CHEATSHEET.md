# Book Q&A Bot — Quick Reference

Sab important cheezein ek jagah — jab bhi bhool jao, ye file khol lena.

---

## Project ki jaankari

- **Local folder:** `D:\Praveen\_Reff\Q-A-Database`
- **GitHub repo:** https://github.com/Parv1989/Que-Ans-Database
- **Live site:** https://que-ans-database.onrender.com
- **Admin panel:** https://que-ans-database.onrender.com/admin
- **Student widget (test):** https://que-ans-database.onrender.com/widget/chat.html
- **Database:** MongoDB Atlas (free cluster)
- **Hosting:** Render.com (free tier)

---

## .env file (server folder ke andar, kabhi GitHub par nahi jaati)

```
MONGO_URI=mongodb+srv://parv09633_db_user:<password>@cluster0.sbpvfkr.mongodb.net/bookqabot?appName=Cluster0
PORT=5000
JWT_SECRET=<apni random string>
ADMIN_USERNAME=<apna username>
ADMIN_PASSWORD=<apna password>
ALLOWED_ORIGINS=*
```

⚠️ Render ke "Environment" tab me `PORT` variable NAHI hona chahiye — Render khud apna port deta hai.

---

## Git commands cheat sheet

**Roz kaam aane wale (jab bhi koi file change karo):**
```
git add .
git commit -m "kya change kiya uska short description"
git push
```
(Pehli baar `git push -u origin main` likhna padta hai, uske baad sirf `git push`.)

**Kabhi-kabhi kaam aane wale:**
```
git status          → dekhne ke liye kaunsi files badli hain
git log --oneline   → pichle saare commits (saves) ki list
git pull            → agar GitHub par kisi ne (ya aapne kahin aur se) change kiya ho, use yahan le aao
```

**Workflow yaad rakhne ka tareeka:**
1. Code me change karo (kisi bhi file me)
2. `git add .` — changes ko taiyar karo
3. `git commit -m "..."` — local save-point banao
4. `git push` — GitHub par bhejo
5. Render khud detect karke 2-5 minute me naya version live kar dega

---

## Local par test karne ke commands

```
cd server
npm install       → sirf ek baar, ya jab naya package add ho
npm run seed       → sample data daalne ke liye (optional)
npm start          → server chalu karne ke liye
```
Fir browser me: `http://localhost:5000/admin`

---

## MongoDB Atlas

- **Network Access:** `0.0.0.0/0` (Allow Access from Anywhere) allowed hona chahiye, warna Render connect nahi kar payega
- Password bhool jao to: Atlas → Database Access → user edit karke naya password set karo, fir `.env` aur Render dono jagah `MONGO_URI` update karna

---

## Render.com

- Root Directory: `server`
- Build Command: `npm install`
- Start Command: `npm start`
- Environment tab me: `MONGO_URI`, `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ALLOWED_ORIGINS`
- Auto-Deploy: `Yes` (Settings tab me check kar sakte ho) — iska matlab `git push` karte hi khud deploy ho jata hai
- Free tier 15 min inactivity ke baad "sleep" ho jata hai — pehla request khulne me 30-50 second lagta hai

---

## Superscript / subscript (maths, science ke liye)

Question ya Answer me kahin bhi ye likho:

| Likhna hai        | Type karo      | Dikhega |
|--------------------|----------------|---------|
| Superscript (power) | `7^2^`         | 7²      |
| Subscript            | `H~2~O`        | H₂O     |

`^` ke beech me jo bhi ho wo superscript ban jayega, `~` ke beech me jo bhi ho wo subscript. Normal `<sup>` jaisi HTML tags kaam nahi karengi (security ke liye), sirf ye `^..^` / `~..~` syntax use karna.

## Robot mascot + voice-over

Student widget me ab ek animated robot dikhta hai jo:
- Idle rehta hai to halka sa bob karta hai aur aankhein jhapkata hai
- Jab bhi bot koi answer bolta hai, uska mooh "talk" animation me chalta hai (lip-sync jaisa effect)
- Answer aane par voice-over bhi automatically bolta hai (browser ki built-in Text-to-Speech — koi extra cost/API key nahi chahiye)
- Chat header me top-right ek 🔊/🔇 button hai jisse voice on/off kar sakte hain

**Limitations jo jaan lena:**
- Voice quality browser/device par depend karti hai (Chrome/Edge me achhi milegi)
- Hinglish words ko English voice thoda ajeeb pronounce kar sakti hai
- iPhone (Safari) par pehli baar voice chalane ke liye ek extra tap chahiye ho sakta hai

## Look and feel

Poora product (admin panel + widget) ab ek naya elegant, student-friendly "indigo/coral" theme use karta hai — rounded corners, "Baloo 2" (heading font) + "Nunito" (body font). Robot mascot bhi isi color scheme me hai.

## CSV bulk upload format

Admin panel → Questions & Answers tab → "Bulk upload CSV" button se ek saath kai questions add kar sakte ho.

**Columns (exactly ye 4 naam header row me chahiye):**

| Column     | Kya daalna hai                                              | Zaroori? |
|------------|--------------------------------------------------------------|----------|
| question   | Student jo type karega, wo sawaal                             | Haan     |
| answer     | Bot ka jawab                                                   | Haan     |
| keywords   | Alag phrasing, semicolon `;` se separate (comma nahi!)         | Nahi     |
| category   | Jaise purchase, support, content — bas organize karne ke liye  | Nahi     |

Ek sample file `sample-questions.csv` alag se di hai dekhne ke liye.

**Zaroori baatein:**
- Agar answer/keyword me comma (,) ho, to us pure cell ko double-quotes `"..."` me rakhna (Excel/Sheets khud kar deta hai save karte waqt)
- keywords me multiple values ke beech comma nahi, semicolon (`;`) use karna
- Khali question ya answer wali row automatically skip ho jayegi, error nahi aayega

---

## Kuch bhi atak jaye to

Error message/screenshot copy-paste kar dena — exact wahi line jo error bata rahi ho (jaise "Cannot find module", "MongoDB connection failed", etc.)
