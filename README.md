# Publisher Book Q&A Bot

Ek smart Q&A chatbot: admin backend se questions/answers add karta hai, students
sirf apna sawaal type karte hain aur unhe fuzzy + synonym matching se best
answer milta hai. Kisi bhi Node.js-supporting host (Render, Railway, VPS,
cPanel with Node, Heroku, etc.) par chal sakta hai — sirf MongoDB connection
chahiye (MongoDB Atlas ka free tier bhi kaam karega).

## Kya hai isme

- **Admin panel** (`/admin`) — login karke Q&A pairs add/edit/delete karo,
  aur "synonyms" (same-meaning words) sikhao bot ko.
- **Student widget** — ek chhota floating chat button jo kisi bhi website
  (WordPress, plain HTML, anything) me ek `<script>` line se add ho jaata hai.
- **Matching engine** — fuzzy search (typo-tolerant) + admin-defined synonyms,
  taki "book ka rate kya hai" aur "price of the book" dono same jawab de dein.

## Setup

1. **Dependencies install karo:**
   ```
   cd server
   npm install
   ```

2. **`.env` file banao** (`.env.example` ko copy karke):
   ```
   cp .env.example .env
   ```
   Fill karo:
   - `MONGO_URI` — MongoDB Atlas se free cluster bana kar connection string paste karo
   - `JWT_SECRET` — koi bhi random lambi string
   - `ADMIN_USERNAME` / `ADMIN_PASSWORD` — apna admin login

3. **(Optional) Sample data daalne ke liye:**
   ```
   npm run seed
   ```

4. **Server chalu karo:**
   ```
   npm start
   ```
   Ye `server.js` `PORT` (default 5000) par sunega.

5. **Admin panel kholo:** `http://localhost:5000/admin`
   Login karke apne book ke questions add karna shuru karo.

## Website par widget lagana

Admin panel ke "Get Widget Code" tab me exact snippet mil jayega. Basically
ye line kisi bhi page ke `</body>` se pehle paste karni hai:

```html
<script src="https://YOUR-SERVER-URL/widget/embed.js" data-bot-url="https://YOUR-SERVER-URL"></script>
```

Ye ek floating chat button add kar dega jo har page par dikhega.

## Deploy kahan karein (koi bhi Node host chalega)

- **Render / Railway** — GitHub repo connect karo, environment variables (.env
  wale) dashboard me daalo, deploy button dabao. Sabse aasaan, free tier available.
- **MongoDB Atlas** — free M0 cluster banao, "Network Access" me `0.0.0.0/0`
  allow karo (ya apne server ka IP), connection string `.env` me daal do.
- **Apna VPS / cPanel with Node.js support** — `npm install && npm start`,
  aur PM2 se background me chalao (`pm2 start server.js`).
- Frontend (admin + widget) same server se serve hota hai, alag hosting ki
  zaroorat nahi.

## Matching kaise kaam karta hai

1. Student ka sawaal lowercase karke tokens me todha jaata hai, common filler
   words (hai, ka, the, is, etc.) hata di jaati hain.
2. Har token ko admin-defined synonym groups se expand kiya jaata hai
   (e.g. "rate" → "price", "cost", "kitna paisa").
3. Fuse.js (fuzzy search library) is expanded query ko har saved question +
   uske keywords ke against match karta hai — spelling mistakes bhi handle
   ho jaati hain.
4. Agar confidence 45% se kam ho to bot seedha wrong answer nahi deta —
   3 closest matching questions suggest kar deta hai jinpar student click
   kar sake.

## Extend karne ke liye ideas (agar future me chahiye)

- Har QA ka `hitCount` already track ho raha hai — ek analytics dashboard
  bana sakte ho "sabse zyada pooche gaye sawaal" dikhane ke liye.
- Multiple books/admins support karna ho to `QA` model me `bookId` field
  add karke filter kar sakte ho.
- WhatsApp par bhi yehi bot chahiye ho to `/api/ask` endpoint already
  reusable hai — bas WhatsApp Business API se webhook jod dena hoga.
