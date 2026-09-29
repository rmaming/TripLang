# TripLang 📔

A personal travel journal for your phone. Write memos about each day, save photos of the places you visit,
and keep track of what you spend. It installs from a web link (a PWA): no app store, it works offline,
and all your data stays on your phone.

![Screenshots](screenshots.png)

## Features

- **Journals**: each trip has a cover photo, destination, dates, currency and an optional budget
- **Day-by-day journal**: memos grouped as *Day 1, Day 2…*, each with a title, story, place, time, mood 🤩 and weather ☀️, plus photos
- **Photos**: attach several photos to a memo, or add loose photos to a day. Tag them with the place and a caption and pick your favorite as the trip cover. Photos are resized automatically to save space.
- **Expenses**: amount, category, note and date, with the total spent, budget left, and each day's spending shown in the journal
- **Summary**: spending by category, average per day, your biggest expense, the overall trip mood, and every place you visited
- **Share and export**: share the journal as text (to Messages, Notes and so on) or export expenses as CSV
- **Backup and restore**: save everything, including photos, to one file and restore it on a new phone
- **Offline**: works abroad without mobile data
- **Dark mode**: follows your phone's setting

## Put it on your phone

1. **Host it (one time):** GitHub Pages on a *private* repo needs GitHub Pro. On a free account, first make the repo public (Settings → General → Danger Zone → Change visibility). That is safe: only the app code is public, your expenses and photos stay on your phone. Then on GitHub, open the repo's **Settings → Pages**. Under *Build and deployment*,
   pick **Deploy from a branch**, choose `main` and `/ (root)`, then click **Save**.
   After about a minute your app is live at `https://rmaming.github.io/TripLang/`.
2. **Install it:**
   - **iPhone (Safari):** open the link, tap **Share**, then **Add to Home Screen**.
   - **Android (Chrome):** open the link, tap **⋮**, then **Install app** (or **Add to Home screen**).
3. Open **TripLang** from your home screen. It runs full-screen, like a normal app.

> Your data is stored on your phone, not online. Use **⋮ → Back up all data** now and then
> (for example, after each trip) so you don't lose anything if you change or reset your phone.

## Run locally

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```
