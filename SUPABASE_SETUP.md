# Supabase setup for SPV Property Calculator

This app keeps a local offline copy in `localStorage` and syncs a shared property workspace to Supabase when a permitted user signs in.

## 1. Create the Supabase project

1. Go to `https://supabase.com/` and create/sign in to your account.
2. Create a **New project**.
3. Choose an organisation, project name and a strong database password.
4. Choose a region reasonably close to you (for example a European region for a UK-based app).
5. Wait until the project is ready.

## 2. Create the property table and security policies

1. In the Supabase dashboard open **SQL Editor**.
2. Choose **New query**.
3. Open the supplied file `supabase-schema.sql` from this project.
4. Copy the whole SQL file into the SQL Editor.
5. Click **Run**.

The script creates/upgrades `public.properties`, enables Row Level Security (RLS), removes anonymous table access, and creates SELECT / INSERT / UPDATE / DELETE policies so every authenticated user can access the same shared property rows.

## 3. Configure email/password authentication

Open **Authentication** in the Supabase dashboard and make sure the Email provider is enabled.

### Easiest setup for a personal calculator

For the simplest first setup, turn **Confirm Email** off while you create the 2–3 accounts you intend to use. The app can then create the account and sign in immediately without relying on confirmation email delivery.

After you have created all intended accounts successfully, turn **Allow new users to sign up** off. Existing users can still sign in, but visitors to the public GitHub Pages URL cannot create additional accounts.

### If you want email confirmation enabled

Leave **Confirm Email** on, then configure **Authentication → URL Configuration**:

- **Site URL:** `https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPOSITORY/`
- Add the same GitHub Pages URL to the allowed redirect URLs if needed.

When the user confirms the email, Supabase can return them to the GitHub Pages app.

## 4. Get the two browser configuration values

In Supabase, open the project's **Connect** dialog or **Settings → API Keys**.

You need only:

1. **Project URL**, similar to:
   `https://abcdefghijklmnop.supabase.co`
2. **Publishable key**, beginning with something similar to:
   `sb_publishable_...`

Older Supabase projects may show a legacy `anon` key. The app accepts that too, but the newer Publishable key is preferred.

**Never use a Secret key or `service_role` key in this app.** Those keys are server-side credentials and can bypass Row Level Security.

## 5. Edit `supabase-config.js`

Open this file:

```text
supabase-config.js
```

Replace the two placeholders:

```javascript
window.SPV_SUPABASE_CONFIG = Object.freeze({
  url: 'https://YOUR_PROJECT_REF.supabase.co',
  publishableKey: 'sb_publishable_REPLACE_ME'
});
```

Example shape only:

```javascript
window.SPV_SUPABASE_CONFIG = Object.freeze({
  url: 'https://abcdefghijklmnop.supabase.co',
  publishableKey: 'sb_publishable_xxxxxxxxxxxxxxxxx'
});
```

It is normal for this file to be visible in a public GitHub Pages repository. A Publishable key is a client-side key; protection of the property data comes from authenticated sessions plus the supplied RLS policies.

## 6. Deploy to GitHub Pages

Upload all files in this folder to the root of your GitHub repository, including:

- `index.html`
- `app.js`
- `cloud.js`
- `supabase-config.js`
- `supabase-schema.sql`
- `styles.css`
- `service-worker.js`
- `manifest.json`
- the `icons` folder

Then open **GitHub → repository → Settings → Pages**, choose **Deploy from a branch**, select `main` and `/(root)`, then save.

## 7. First use

1. Open the GitHub Pages URL.
2. Tap/click **Sign in** in the app header.
3. Choose **Create account** the first time, or **Sign in** if the account already exists.
4. Existing local properties will be merged into the shared Supabase property list on sync.
5. Save a property. The app first saves locally, then syncs the record to the shared Supabase workspace when online. Other signed-in users receive it on their next sync/app load.

## 8. Offline behaviour

- The calculator works without Supabase or an internet connection.
- Property changes are saved locally first.
- If you are signed in but offline, cloud sync waits until the device is online again.
- Deletions are also queued locally so a deleted cloud property is not intentionally restored during the next merge.
- Signing out does **not** erase the local copy on that device.

## 9. Checking your data in Supabase

In Supabase open **Table Editor → properties**. Each row contains:

- `user_id` — the Auth user who originally created the row (informational; it does not restrict shared access)
- `id` — property record ID
- `data` — the full calculator record as JSON
- `created_at`
- `updated_at`

The JSON approach means future calculator fields can be added without needing a new database column for every new input.

## 10. Troubleshooting

### App says “Cloud not configured”
Check `supabase-config.js` and make sure both placeholders were replaced, then reload the page.

### “Invalid API key” or authentication fails
Re-copy the **Publishable** key and Project URL from Supabase. Do not use a Secret key.

### Sign-up succeeds but you are not signed in
Your Supabase project probably has **Confirm Email** enabled. Confirm the email and return to the app, or temporarily disable Confirm Email for the initial personal setup.

### Database returns permission/RLS errors
Run `supabase-schema.sql` again and check that RLS is enabled and the four **Authenticated users can ... shared properties** policies exist on `public.properties`.

### Cloud library unavailable while offline
The calculator remains usable locally. Once online, reload the app if necessary; the Supabase SDK is then cached for later PWA use.


## Shared access model

All authenticated users in this Supabase project can read, create, edit and delete all property rows. Keep the user list small and controlled. Once your 2–3 accounts exist, disable new public sign-ups in Supabase Authentication settings. Signed-out visitors have no access to the table.
