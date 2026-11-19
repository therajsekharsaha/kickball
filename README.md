# Head Kick Arena

A 2D head-football game: React + Phaser 3 + Firebase (Auth + Realtime Database) + Font Awesome.
Original art and branding; inspired by the head-football genre.

## Features
- Email/password, Google and guest sign-in
- Realtime profile: coins, trophies, wins/losses, goals, best score, owned skins
- Ranks (Rookie → Legend) driven by trophies, with live global leaderboard
- Shop: buy character skins with coins
- Modes: vs CPU (Easy / Normal / Hard) and local 2-player
- Touch controls on mobile, keyboard on desktop

## Setup
1. Create a Firebase project at https://console.firebase.google.com
2. Authentication → Sign-in method → enable **Email/Password**, **Google**, **Anonymous**
3. Build → Realtime Database → Create database
4. Realtime Database → Rules → paste the contents of `database.rules.json` → Publish
5. Project settings → Your apps → Web app → copy config values into `.env` (copy `.env.example`)
6. `npm install` then `npm run dev`

## Controls
- Player 1: A / D move, W jump, Space or J kick (arrow keys also work in vs-CPU mode)
- Player 2 (local): Arrow keys move/jump, Enter or L kick

## Security note
Coins and trophies are written by the client, so a determined player could cheat.
For a production release, move reward logic into Cloud Functions and make `coins`/`trophies` read-only for clients.
