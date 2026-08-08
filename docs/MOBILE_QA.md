# Mobile QA Matrix

Automated Playwright checks run the app at 320 px, 412 px, and 430 px widths. They verify all four primary destinations, authentication errors, full-screen and home-screen actions, and horizontal overflow. Pixel snapshots cover the sign-in screen, game home, world lobby, and account screen.

Before a public mobile release, repeat this short real-device pass:

| Device/browser | Sign in | Home/lobby/friends/account | Create/join/QR | Live match/reconnect | Result/review |
| --- | --- | --- | --- | --- | --- |
| Android Chrome | required | required | required | required | required |
| Android WeChat browser | required | required | required | required | required |
| iPhone Safari | required | required | required | required | required |
| iPhone WeChat browser | required | required | required | required | required |

For each live-match pass, use two accounts on different devices. Close one page for at least 35 seconds and confirm the opponent sees the departure result. Rotate once during a match, background the page for 20 seconds, return, and confirm the turn clock and board state recover. Test the smallest available phone with system text size at 125%.

Run the automated matrix on port 3000:

```powershell
npm run test:e2e
```
