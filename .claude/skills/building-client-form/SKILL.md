---
name: building-client-form
description: >-
  Team pattern for building a form in Next.js 16 App Router with React 19: a Client Component with
  useActionState plus a Server Action that checks session, permissions and validation itself,
  accessible field errors, works without JavaScript, no PII in logs, slow side effects in after().
  Use when adding or changing any form or Server Action that handles user input: lead / contact /
  estimate request forms, feedback, settings, notes, comments, status changes in the dashboard.
  Тригери: «додай форму…», «форма заявки», «форма кошторису», «додати нотатку», «зроби поле / кнопку
  зберегти», «помилки валідації не видно», «форма думає / довго надсилається», «форма не працює без JS»,
  «add a form», «server action for …».
  Не для: форм лише для читання (пошук, фільтри через searchParams), Route Handlers для зовнішніх
  клієнтів, інтеграції з n8n (для контракту вебхука — окремий скіл).
metadata:
  owner: studio-nova-web
  version: "0.2.0"
---

# Клієнтська форма + Server Action

Кожна форма в наших проєктах робиться за одним патерном: Server Action — це публічний POST-ендпоінт,
тож безпеку, валідацію й відповідь тримаємо в дії, а UI лише показує стан. Це рішення команди,
а не варіант на вибір.

## Коли застосовувати

- Нова форма або зміна існуючої: публічна (`app/page.tsx`) чи в дашборді (`app/dashboard/**`).
- Нова або змінена Server Action (`"use server"`), яку викликає форма чи кнопка.
- **Не** застосовувати: пошук і фільтри без мутацій (там `searchParams`), API для сторонніх систем.

## Як робимо

Файли: дія — у `app/<сегмент>/actions.ts` (або `app/actions.ts`); парсер — чиста функція в
`lib/<форма>-form.ts` (як `parseLeadForm` у `lib/lead-form.ts`); UI — `components/<форма>-form.tsx`
з `"use client"`.

1. **Тип стану — дискримінований union, лише `{ status, … }`:**
   ```ts
   export type NoteFormState =
     | { status: "idle" }
     | { status: "invalid"; errors: Partial<Record<NoteField, string>>; values: Partial<Record<NoteField, string>> }
     | { status: "error"; message: string }
     | { status: "ok" };
   ```
   Дія **ніколи** не повертає рядок з бази, `Lead`, `User` чи помилку як є — див. `server-serialization`.
   `values` — лише те, що ввів користувач (щоб відновити поля), без полів, яких він не вводив.

2. **Server Action — перевірки всередині, в цьому порядку** (правило `server-auth-actions`;
   рендер форми лише на захищеній сторінці — не межа безпеки):
   ```ts
   "use server";
   export async function addNote(_prev: NoteFormState, formData: FormData): Promise<NoteFormState> {
     const user = await getSessionUser();               // сесія: немає → { status: "error", message: "Увійдіть знову" } або redirect("/login")
     const leadId = formData.get("leadId");             // id ресурсу — з прихованого поля, недовірений
     const lead = typeof leadId === "string" ? await db.getLead(leadId) : null;
     if (!lead || lead.workspaceId !== user.workspaceId) // права: ресурс належить робочому простору користувача
       return { status: "error", message: "Немає доступу" };
     const parsed = parseNoteForm(formData);            // валідація на сервері, завжди
     if (!parsed.ok) return { status: "invalid", errors: parsed.errors, values: parsed.values };
     await db.appendNote(lead.id, parsed.data.note);
     after(() => logAudit("lead.note_added", lead.id)); // повільне — після відповіді
     revalidatePath(`/dashboard/leads/${lead.id}`);
     return { status: "ok" };
   }
   ```
   - Id ресурсу (`leadId`) приходить з клієнта — він недовірений, права перевіряй саме на нього.
   - Парсер обрізає й обмежує довжину (`trim().slice(0, max)`), перевіряє enum-и за списком
     (`BUDGET_OPTIONS.some(...)`), повідомлення помилок — українською, по одному на поле.
   - Не довіряй `hidden`-полям з ідентифікаторами робочого простору чи ролі — бери їх із сесії.

3. **Повільні побічні ефекти — в `after()` з `next/server`** (правило `server-after-nonblocking`):
   листи, вебхуки n8n, аудит, аналітика. Користувач не чекає на них. Якщо результат ефекту
   **треба** показати користувачу (наприклад, n8n повертає номер кошторису) — це не побічний ефект:
   зупинись і спитай (див. правила зупинки).

4. **Клієнтський компонент — `useActionState`, форма працює без JS:**
   ```tsx
   const [state, formAction, pending] = useActionState(addNote, { status: "idle" });
   <form action={formAction} noValidate>
     <input type="hidden" name="leadId" value={leadId} /> … <button type="submit" disabled={pending}>…</button></form>
   ```
   - `action={formAction}` на `<form>` (не `onSubmit` + `fetch`) — так форма відправляється й без JS.
   - **Не** `useActionState(action.bind(null, id), …)`: у Next.js 16.3.5 / React 19.2 відправка такої
     форми без JS (прихований `$ACTION_1:1` з прив'язаним аргументом) заганяє сервер у 100% CPU —
     зависає цей запит і всі наступні. Id ресурсу — прихованим полем, як вище.
   - Кнопка — `type="submit"`; стан очікування — з `pending`, текст «Зберігаємо…».
   - Жодного `useEffect` для реакції на результат, жодного `useState`, що дублює поле.

5. **Доступні помилки й збереження введеного:**
   ```tsx
   const errors = state.status === "invalid" ? state.errors : {};
   const values = state.status === "invalid" ? state.values : {};
   <label htmlFor="note">Нотатка</label>
   <textarea id="note" name="note" maxLength={500} defaultValue={values.note ?? ""}
     aria-invalid={errors.note ? true : undefined}
     aria-describedby={errors.note ? "note-error" : undefined} />
   {errors.note && <p id="note-error" className="text-xs text-red-600">{errors.note}</p>}
   {state.status === "invalid" && <div role="alert">Перевірте поля: {Object.keys(errors).length}</div>}
   {state.status === "error" && <div role="alert">{state.message}</div>}
   ```
   - Кожне поле має `<label>` (обгорткою або `htmlFor` + `id`).
   - React 19 скидає форму після дії — тому введене повертається з сервера через `values` →
     `defaultValue`. Паролі й секрети назад не повертаємо.
   - Успіх — теж текстом (`role="status"` або заміна форми повідомленням), не лише зміною кольору.

6. **Журнали без персональних даних.** Ні `console.log(formData)`, ні `console.log(lead)`, ні email,
   телефону, імені, IP, тексту повідомлення. Логуємо лише ідентифікатор і дію:
   `console.error("Failed to add note", lead.id, (error as Error).message)`.

## Чекліст

```
- [ ] 1. Дія сама перевіряє сесію → права на ресурс → валідацію (server-auth-actions).
- [ ] 2. Дія повертає лише { status, … }; немає об'єктів з бази у відповіді (server-serialization).
- [ ] 3. Форма: <form action={formAction}>, useActionState, кнопка type="submit" з pending.
- [ ] 4. Кожне поле з <label>; при помилці aria-invalid + aria-describedby на id тексту помилки.
- [ ] 5. Підсумок помилок у role="alert"; введене повертається через values → defaultValue.
- [ ] 6. Листи / n8n / аудит — в after() (server-after-nonblocking), якщо результат не потрібен у відповіді.
- [ ] 7. Жодних персональних даних у console.* і в журналі сервера.
- [ ] 8. Обмеження довжини однакові на клієнті (maxLength) і на сервері (slice/перевірка).
```

## Правила зупинки — зупинись і спитай людину, якщо:

- незрозуміло, **хто** має право на дію (роль `owner` vs `manager`, чужий робочий простір, публічна форма);
- потрібна нова таблиця / поле в `lib/db.ts` чи зміна типу в `lib/types.ts`, яку задача прямо не описує;
- результат повільного ефекту (n8n, пошта) треба показати користувачу — тоді `after()` не підходить;
- форма збирає нові персональні дані (документи, дата народження, платіжні дані) чи згоду на обробку;
- для задачі треба вимкнути перевірку, прибрати валідацію або повернути з дії об'єкт з бази.

## Verify — задача готова, лише коли:

- [ ] `npm run lint` і `npm run build` без помилок.
- [ ] Порожня відправка: під кожним обов'язковим полем — текст помилки, поле має `aria-invalid="true"`,
      є блок `role="alert"`; інше введене не зникло.
- [ ] Без JS (DevTools → Command Menu → «Disable JavaScript», перезавантажити): форма відправляється,
      помилки й успіх показуються після повного перезавантаження сторінки, а сервер і далі відповідає
      на інші запити (не завис).
- [ ] Дія без сесії: у вікні інкогніто / без cookie `leaddesk_session` повтор POST (DevTools → Network →
      «Copy as cURL» без cookie) не змінює даних і повертає помилку / редирект на `/login`.
- [ ] Журнал `npm start` / `npm run dev` після відправки: немає email, телефону, імені, тексту повідомлення
      чи `FormData`; час відповіді дії не включає лист / n8n / аудит (вони в `after()`).
