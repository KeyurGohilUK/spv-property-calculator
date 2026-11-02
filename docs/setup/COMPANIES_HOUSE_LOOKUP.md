# Companies House deadline lookup

This feature requires the **COMPANIES_HOUSE_API_KEY** secret in Supabase Edge Functions, created via the [Companies House Developer Hub](https://developer.company-information.service.gov.uk/).

Deploy `supabase/functions/company-house-lookup/index.ts` using the project's standard Supabase deployment workflow. Ensure the function is deployed before enabling the client feature. This service uses the signed-in user's JWT and checks the shared workspace membership; the key is never included in browser JavaScript or GitHub.

The company number is reused from Company Management. With network connectivity, the app requests the public company profile and displays the next annual accounts and confirmation statement due dates. A failed request leaves deadlines unverified; it does not infer HMRC dates, filing status or actual compliance. No details are saved beyond the active page session. No database migration is required.

**Operational checks:** set the secret securely, deploy the function, sign in as an active workspace member, confirm a valid eight-character company number, inspect due dates against Companies House, and test invalid company numbers, logged-out requests, denied workspace users and a missing secret. Rate limiting and caching should be evaluated before rolling out to many companies.
