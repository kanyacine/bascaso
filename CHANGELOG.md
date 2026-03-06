# Changelog

## 1.2.2

- Add app picker after setup – choose which app to manage when you have multiple apps
- Add copyright field to the store listing page
- Expand submission checklist with screenshots, app name, support URL, privacy policy, and copyright checks
- Surface associated errors from App Store Connect when submission fails – show the actual reasons (missing metadata, screenshots, etc.) instead of a generic error
- Fix review submission cleanup – reuse existing draft submissions instead of failing to delete them
- Fix app details refresh – the refresh button now reloads app info and localizations from App Store Connect
- Invalidate app info caches on global refresh

## 1.2.1

- Add demo mode – "Explore with sample data" on the setup screen lets you browse the full dashboard with three fictional apps, no credentials required
- Add Tab/Shift+Tab navigation between text inputs on store listing, app details, app review, and TestFlight info pages
- Retry on transient App Store Connect server errors (500) with exponential backoff
- Fix analytics not loading for accounts that never opened App Store Connect analytics on the web – automatically create report requests when none exist
- Fix proceeds chart and date picker disappearing when selected range has no data
- Fix AI status not updating after configuring a provider without restarting the app
- Fix "what's new" field causing sync errors on the first-ever app version – hide the field and submission checklist item when no version has been distributed yet

## 1.1.0

- Add Mac App Store build support with StoreKit in-app purchase
- Add local AI server support (LM Studio and OpenAI-compatible servers)
- Add file-based logging with automatic rotation and diagnostics export via Help menu

## 1.0.0

- Initial release
