# Forever Roster

Shawn's WoW: Forever character roster: dual-box pairs, professions, mailing plan, macros and per-character plans,
with live levels, gear and professions pulled from the Armory.

- **Site:** https://sshillyer.github.io/forever-roster/
- **Live data:** `.github/workflows/sync.yml` runs every 3 hours (or on demand from the Actions tab). It reads the
  characters listed in `data/roster.json` from Blizzard's Profile API (`profile-forever-us`) and commits
  `data/characters.json` when something changed. It needs two repository secrets: `BLIZZARD_CLIENT_ID` and
  `BLIZZARD_CLIENT_SECRET`.
- **Adding a character:** add its full name to `data/roster.json`. Characters only show up on the Armory from level 10,
  after logging out once.

The Forever API namespaces are live but undocumented, so fields may change.
