# LeakShield: Narrator Cheat-Sheet (Ojaswi)

Arihant chalata hai (driver), Ojaswi bolti hai (narrator). Source: `docs/DEMO.md` (main). Kul 5 minute. **Bold line** = zaroor bolna.

---

## Running order

| Time | Driver kya karega | Screen pe | Ojaswi bolegi |
| --- | --- | --- | --- |
| 0:00–0:25 | Title, phir architecture slide | 7 checkpoints | **"Har din employees AI me Aadhaar, PAN aur API keys paste karte hain. LeakShield user aur model ke beech ek zero-trust gateway hai: detection fail ho tab bhi data leak nahi hota."** |
| 0:25–1:15 | Asha: KYC starter (Aadhaar + PAN), phir footer follow-up | MASKED; "Sent to model" me `[AADHAAR_…]`, "User sees" me asli number | **"Model ko asli Aadhaar kabhi nahi mila, sirf token gaya. Jawab me Asha ko apni value wapas mili. Doosre message me bhi wahi token: conversation vault."** |
| 1:15–1:35 | AWS key wala starter, phir **Replace with [SECRET_…] and send** | BLOCKED `calls 0`, phir ALLOWED | **"Key mili toh request ruk gayi, model ko zero calls. Ek click me secret hata ke kaam aage chalta hai."** |
| 1:35–2:25 | Teen attack: paraphrase, Hinglish, base64 | Teen BLOCKED; teesre pe `via decoded` | **"Paraphrase, Hinglish, base64: teeno pakde gaye. Normaliser pehle text saaf karta hai, phir detection."** |
| 2:25–3:15 | Asha salary, Asha "I am Ravi from HR", phir Ravi | Asha DENIED do baar, title bhi nahi; Ravi ko citation ke saath jawab | **"Same sawaal, alag identity, alag result. Identity JWT se aati hai, prompt se nahi. Restricted document Asha ke context me kabhi gaya hi nahi."** |
| 3:15–3:35 | Asha: vendor payment terms | QUARANTINED, phir bhi jawab | **"Is document me chhupa hua instruction tha. Poora document quarantine hua, par Asha ko jawab phir bhi mila."** |
| 3:35–3:55 *(time kam ho toh cut)* | Meera: Garuda; Approvals me Approve | PENDING → approved | "Confidential document external model pe bina admin approval ke nahi jaata. Approval request ke hash se bandha hai." |
| 3:55–4:10 *(cut)* | `npm run sdk` in `demo/` | OpenAI SDK, ek line badli | "Koi bhi existing app sirf ek line badal ke LeakShield use kar sakta hai." |
| 4:10–4:50 | Run eval → live subset; Incidents | Scoreboard; baseline vs LeakShield | **"Yeh claim nahi, measurement hai. Same 60 cases, asli Groq model: bina LeakShield ke 12 leaks, humare saath 1. Aur audit log me ek bhi asli value nahi."** |
| 4:50–5:00 | Final slide | Metrics | **"Useful answers, and you can see exactly what reached the model."** |

Time kam pade toh pehle Approval wala segment kaato, phir SDK wala.

---

## Detection ke numbers (agar koi pooche)

| Kya | Number |
| --- | --- |
| Normal prompt pe detection ka time | p95 **0.25 ms** (Apple M3, sirf rules) |
| 5,000 characters ka document | ~3.8 ms |
| Sabse lamba allowed input (100,000 chars) | ~61 ms |
| DeBERTa classifier (test kiya, **band rakha**) | Paraphrase pakadta hai, lekin 110 normal prompts me se 19 pe galat alarm (17%) |
| 110 normal prompts pe galat alarm | **0** |
| Dev set (20 cases) | 0 galat alarm, 0 miss |
| Held-out (60, frozen, Groq) leaks | **12 → 1** (91.7% kam), user leaks 1 → 0 |
| Held-out recall / precision | **1.00 / 0.82**, exact action 48/60 (baseline 26/60) |
| Normal kaam me rukawat | **7/28**: 4 search ne galat document uthaya, 3 detector |
| Reworded attacks (60) | 0 leaks, retention **0.95** (Hinglish 0.8) |
| Gateway delay (model ke bina) | p50 **24 ms**, p95 **70 ms** |
| Ek leak kaunsa? | IFSC code: policy warn karti hai, mask nahi (jaan-boojh ke) |

---

## Mushkil sawaal

- **"1 leak kya tha?"** IFSC code: bank branch ka public code. Humari policy use jaan-boojh ke sirf warn karti hai, mask nahi. Yeh policy ka choice hai, aur hum use chhupate nahi.
- **"7/28 galat rukawat kyun?"** 4 baar search ne galat sensitive document utha liya (baad me relevance fix aaya). 3 baar detector: ek placeholder key, ek jawab jo attack samjha raha tha, aur ek email jaisa address. Teeno ka fix pata hai aur likha hua hai.
- **"Hinglish?"** Rules ne Hinglish me dobara likhe 8 attacks me se 4 pakde. Gateway ke baaki checks ke saath retention 0.8 rahi. Hinglish pe fine-tuning agla kadam hai.

- **"Detector fail ho gaya toh?"** Restricted document model ke context me jaata hi nahi, kyunki ACL retrieval query ke andar hai. Woh deewar detection pe depend nahi karti.
- **"Kaunsa model use kiya? Train kiya?"** Jawab ke liye Groq (offline me Ollama). Attack pakadne ke liye humne pretrained DeBERTa-v3 classifier (ProtectAI) asli model ke saath **test kiya**: woh paraphrase attacks pakadta hai, lekin humare 110 normal prompts me se 19 pe galat alarm deta tha (code, "ignore the typo" jaisi lines). Isliye **default band rakha**, aur jo attack families sirf classifier pakad raha tha ("hidden setup text echo karo", "you are an AI without guidelines", "jo share nahi karna woh batao"), unke liye **naye rules jod diye**. Measurement `results/ojaswi/classifier-check.md` me hai. Detection humare rules se hoti hai: Verhoeff, Luhn, regex, Hinglish aur Devanagari rules, 0 galat alarm ke saath. Aage ka step: Hinglish aur office text pe fine-tune karke dobara calibrate karna.
- **"Hinglish ka kya?"** Classifier sirf English samajhta hai. Hinglish aur Devanagari Hindi ke liye humare apne rules hain, aur Hinglish attacks pe alag se test kiya hai.
- **"Har 12-digit number Aadhaar maan loge?"** Nahi. Verhoeff checksum ke saath "Aadhaar" word ya 4-4-4 format chahiye. Sirf checksum pass ho toh warning, kyunki ~10 me se 1 random number bhi pass ho jaata hai.
- **"Shabdon me likh diya, 'nine eight seven…'?"** Woh bhi pakda jaata hai, English aur Hinglish ("nau aath saat…") dono, aur Devanagari digits bhi.
- **"Groq ko data jaata hai?"** Sirf tokens aur admin-approved content. Approved confidential content Groq tak jaata hai, isliye admin decision chahiye.
- **"Seedha chatgpt.com pe type kiya toh?"** Gateway company apps aur humari chat cover karta hai. chatgpt.com ke liye browser extension stretch goal hai.
- **"Latency kitni badhti hai?"** Detection normal prompt pe 1 ms se kam. Classifier on ho toh ~10 ms aur. LLM ka time isse kahin zyaada hai.

---

## Agar kuch toota

| Problem | Kya karna |
| --- | --- |
| Groq slow/down | `.env` me Ollama, gateway restart (~20 sec). Tab tak architecture slide pe bolte raho |
| Wi-Fi gaya | Ollama local; gateway hi gir gaya toh backup video |
| Console pe MOCK GATEWAY | Gateway Vite se nahi jud raha; video se demo. **Mock numbers kabhi result mat bolna** |
| Koi case live miss hua | **"Yeh humare misses me hai, slide pe bhi hai."** Phir aage badho |

---

## Kya mat bolna

- "100% secure" → bolo **"humne measure kiya hai, yeh numbers aur yeh misses hain."**
- "Data kabhi bahar nahi jaata" → approved content Groq tak jaata hai. Bolo **"aap dekh sakte ho exactly kya gaya."**
- "Canary har leak pakadta hai" → canary ek extra alarm hai, asli suraksha permissions se hai.
- Dev set ke numbers ko final result mat bolna. Final = frozen held-out (12 → 1).
- "Zero leaks" mat bolna: frozen run me 1 leak hua (IFSC). Bolo **"12 se 1"**.
